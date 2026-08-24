import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { spawn } from "child_process";
import { PassThrough } from "stream";
import { randomUUID } from "crypto";

const app = new Hono();

app.use("/*", cors());

// Logging Middleware
app.use("*", async (c, next) => {
  const reqId = randomUUID().slice(0, 8);
  const start = Date.now();
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status >= 400 ? "error" : "success";
  
  let endpoint = c.req.path.replace("/api/", "");
  if (!endpoint || endpoint === "/") endpoint = "unknown";
  
  console.log(`[req_${reqId}] ${endpoint} youtube duration=${duration}ms status=${status}`);
});

app.use(
  "/api/extract",
  bodyLimit({
    maxSize: 10 * 1024, // 10 KB limit for JSON body
    onError: (c) => c.json({ success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Payload too large." } }, 413),
  })
);

const rateLimitMap = new Map<string, number[]>();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000;

function isRateLimited(ip: string, type: "extract" | "stream"): boolean {
  const key = `${type}:${ip}`;
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const validTimestamps = timestamps.filter(t => now - t < WINDOW_MS);
  
  if (validTimestamps.length >= MAX_REQUESTS) {
    return true;
  }
  
  validTimestamps.push(now);
  rateLimitMap.set(key, validTimestamps);
  return false;
}

function validateVideoUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    
    // 1. Enforce HTTPS only (blocks file://, ftp://, http://)
    if (url.protocol !== "https:") {
      return false;
    }
    
    // 2. Strict Domain Allowlist
    const allowedHosts = ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"];
    if (!allowedHosts.includes(url.hostname)) {
      return false;
    }
    
    // 3. String-level SSRF defense (Reject private/local IPs hiding in hostnames or credentials)
    // Even though hostname is checked above, URL parsers can sometimes be tricked (e.g. https://youtube.com@127.0.0.1/)
    // so we defensively scan the raw string for private IPs or localhost references.
    const rawLower = urlString.toLowerCase();
    if (
      rawLower.includes("localhost") || 
      rawLower.match(/(^|\/|@)127\.\d+\.\d+\.\d+/) || 
      rawLower.match(/(^|\/|@)192\.168\.\d+\.\d+/) || 
      rawLower.match(/(^|\/|@)10\.\d+\.\d+\.\d+/) || 
      rawLower.match(/(^|\/|@)172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/) ||
      rawLower.includes("[::1]") // IPv6 localhost
    ) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.post("/api/extract", async (c) => {
  // Simple IP extraction
  const ip = c.req.header('x-forwarded-for') || "unknown";
  
  if (isRateLimited(ip, "extract")) {
    return c.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a minute." } }, 429);
  }

  let body: { url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid JSON body." } }, 400);
  }

  const url = body.url;
  if (!url || !validateVideoUrl(url)) {
    return c.json({ success: false, error: { code: "INVALID_URL", message: "Invalid YouTube URL provided." } }, 400);
  }

  // Spawn yt-dlp to get JSON metadata only
  // We specify the strict format requirements: pre-merged MP4 container with H.264 (avc) and AAC (mp4a).
  const ytdlp = spawn("yt-dlp", [
    "-f", "best[ext=mp4][vcodec^=avc][acodec^=mp4a]",
    "--dump-json",
    "--no-playlist",
    url
  ]);

  let stdoutData = "";
  ytdlp.stdout.on("data", (data) => {
    stdoutData += data.toString();
  });

  let stderrData = "";
  ytdlp.stderr.on("data", (data) => {
    stderrData += data.toString();
  });

  return new Promise((resolve) => {
    ytdlp.on("close", (code) => {
      if (code !== 0) {
        if (stderrData.includes("Requested format is not available")) {
          return resolve(c.json({
            success: false,
            error: {
              code: "UNSUPPORTED_FORMAT",
              message: "Unsupported media. Could not find a compatible H.264/AAC MP4 format."
            }
          }, 400));
        }
        return resolve(c.json({ success: false, error: { code: "EXTRACTION_FAILED", message: "Failed to extract metadata." } }, 500));
      }
      try {
        const metadata = JSON.parse(stdoutData);
        
        // Enforce 60-second maximum duration limit
        if (metadata.duration > 60) {
          return resolve(c.json({
            success: false,
            error: {
              code: "VIDEO_TOO_LONG",
              message: "Videos must be 60 seconds or shorter."
            }
          }, 400));
        }

        // Enforce 50 MB file size limit
        const sizeBytes = metadata.filesize || metadata.filesize_approx;
        const maxBytes = 50 * 1024 * 1024; // 50 MB
        if (sizeBytes && sizeBytes > maxBytes) {
          return resolve(c.json({
            success: false,
            error: {
              code: "VIDEO_TOO_LARGE",
              message: "Video file exceeds the 50 MB limit."
            }
          }, 400));
        }

        resolve(c.json({
          title: metadata.title,
          duration: metadata.duration,
          thumbnail: metadata.thumbnail,
          id: metadata.id
        }));
      } catch (err) {
        resolve(c.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to parse metadata." } }, 500));
      }
    });

    // Timeout safety
    setTimeout(() => {
      if (!ytdlp.killed) {
        ytdlp.kill();
        resolve(c.json({ success: false, error: { code: "EXTRACTION_FAILED", message: "Extraction timed out." } }, 504));
      }
    }, 15000); // 15 seconds for metadata is plenty
  });
});

app.get("/api/download", async (c) => {
  const ip = c.req.header('x-forwarded-for') || "unknown";
  if (isRateLimited(ip, "stream")) {
    return c.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many streaming requests. Please wait a minute." } }, 429);
  }

  const url = c.req.query("url");
  if (!url || !validateVideoUrl(url)) {
    return c.json({ success: false, error: { code: "INVALID_URL", message: "Invalid YouTube URL provided." } }, 400);
  }

  try {
    // 1. Resolve the direct media URL from yt-dlp
    const directUrl = await new Promise<string>((resolve, reject) => {
      const ytdlp = spawn("yt-dlp", [
        "-f", "best[ext=mp4][vcodec^=avc][acodec^=mp4a]",
        "-g",
        "--no-playlist",
        url
      ]);
      
      let out = "";
      ytdlp.stdout.on("data", (d) => out += d.toString());
      
      ytdlp.on("close", (code) => {
        if (code === 0 && out.trim()) {
          resolve(out.trim());
        } else {
          reject(new Error("Failed to resolve direct media URL"));
        }
      });
      
      setTimeout(() => {
        if (!ytdlp.killed) ytdlp.kill();
        reject(new Error("yt-dlp timeout"));
      }, 15000);
    });

    // 2. Forward the Range header to YouTube's CDN
    const rangeHeader = c.req.header("Range");
    const fetchHeaders = new Headers();
    if (rangeHeader) {
      fetchHeaders.set("Range", rangeHeader);
    }
    
    // Some streams require a User-Agent matching the request to prevent 403 Forbidden
    fetchHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    const ytResponse = await fetch(directUrl, {
      method: "GET",
      headers: fetchHeaders
    });

    if (!ytResponse.ok && ytResponse.status !== 206) {
      throw new Error(`Upstream returned ${ytResponse.status}`);
    }

    // 3. Proxy the response headers back to the browser
    const proxyHeaders = new Headers();
    
    // Copy critical streaming headers from the upstream response
    const headersToCopy = [
      "content-type", 
      "content-length", 
      "content-range", 
      "accept-ranges"
    ];
    
    for (const h of headersToCopy) {
      if (ytResponse.headers.has(h)) {
        proxyHeaders.set(h, ytResponse.headers.get(h)!);
      }
    }
    
    // Ensure we force mp4 mime type just in case upstream differs
    proxyHeaders.set("Content-Type", "video/mp4");

    // 4. Return the streaming response! Hono handles the ReadableStream automatically.
    return new Response(ytResponse.body, {
      status: ytResponse.status,
      headers: proxyHeaders
    });

  } catch (error) {
    console.error("Streaming error:", error);
    return c.json({ success: false, error: { code: "UPSTREAM_ERROR", message: "Failed to stream media." } }, 500);
  }
});

const port = 4000;
console.log(`API Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});

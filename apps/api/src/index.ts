import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { spawn } from "child_process";
import { PassThrough } from "stream";

const app = new Hono();

app.use("/*", cors());

// Basic memory rate limit (IP -> timestamp array)
const rateLimitMap = new Map<string, number[]>();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter(t => now - t < WINDOW_MS);
  
  if (validTimestamps.length >= MAX_REQUESTS) {
    return true;
  }
  
  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
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
  
  if (isRateLimited(ip)) {
    return c.json({ error: "Too many requests. Please wait a minute." }, 429);
  }

  let body: { url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const url = body.url;
  if (!url || !validateVideoUrl(url)) {
    return c.json({ error: "Invalid YouTube URL provided." }, 400);
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
    console.log(`yt-dlp log: ${data.toString()}`);
  });

  return new Promise((resolve) => {
    ytdlp.on("close", (code) => {
      if (code !== 0) {
        if (stderrData.includes("Requested format is not available")) {
          return resolve(c.json({
            code: "UNSUPPORTED_MEDIA",
            message: "Unsupported media. Could not find a compatible H.264/AAC MP4 format."
          }, 400));
        }
        return resolve(c.json({ error: "Failed to extract metadata." }, 500));
      }
      try {
        const metadata = JSON.parse(stdoutData);
        
        // Enforce 60-second maximum duration limit
        if (metadata.duration > 60) {
          return resolve(c.json({
            code: "VIDEO_TOO_LONG",
            message: "Videos must be 60 seconds or shorter."
          }, 400));
        }

        // Enforce 50 MB file size limit
        const sizeBytes = metadata.filesize || metadata.filesize_approx;
        const maxBytes = 50 * 1024 * 1024; // 50 MB
        if (sizeBytes && sizeBytes > maxBytes) {
          return resolve(c.json({
            code: "FILE_TOO_LARGE",
            message: "Video file exceeds the 50 MB limit."
          }, 400));
        }

        resolve(c.json({
          title: metadata.title,
          duration: metadata.duration,
          thumbnail: metadata.thumbnail,
          id: metadata.id
        }));
      } catch (err) {
        resolve(c.json({ error: "Failed to parse metadata." }, 500));
      }
    });

    // Timeout safety
    setTimeout(() => {
      if (!ytdlp.killed) {
        ytdlp.kill();
        resolve(c.json({ error: "Extraction timed out." }, 504));
      }
    }, 15000); // 15 seconds for metadata is plenty
  });
});

app.get("/api/download", async (c) => {
  const ip = c.req.header('x-forwarded-for') || "unknown";
  if (isRateLimited(ip)) {
    return c.json({ error: "Too many requests. Please wait a minute." }, 429);
  }

  const url = c.req.query("url");
  if (!url || !validateVideoUrl(url)) {
    return c.json({ error: "Invalid YouTube URL provided." }, 400);
  }

  const passThrough = new PassThrough();

  const ytdlp = spawn("yt-dlp", [
    "-f", "best[ext=mp4][vcodec^=avc][acodec^=mp4a]",
    "-o", "-",
    url
  ]);

  ytdlp.stdout.pipe(passThrough);

  ytdlp.stderr.on("data", (data) => {
    console.log(`yt-dlp stream log: ${data.toString()}`);
  });

  ytdlp.on("error", (error) => {
    console.error("Failed to start yt-dlp streaming:", error);
    passThrough.end();
  });

  ytdlp.on("close", (code) => {
    console.log(`yt-dlp stream exited with code ${code}`);
    passThrough.end();
  });

  // 60-second timeout to kill the stream if it takes too long
  setTimeout(() => {
    if (!ytdlp.killed) {
      console.log("yt-dlp stream timeout, killing process.");
      ytdlp.kill();
      passThrough.end();
    }
  }, 60000);

  c.header("Content-Type", "video/mp4");
  c.header("Content-Disposition", "attachment; filename=\"stream.mp4\"");
  
  // @ts-ignore
  return c.body(passThrough);
});

const port = 4000;
console.log(`API Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});

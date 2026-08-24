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

app.get("/api/extract", async (c) => {
  // Simple IP extraction
  const ip = c.req.header('x-forwarded-for') || "unknown";
  
  if (isRateLimited(ip)) {
    return c.json({ error: "Too many requests. Please wait a minute." }, 429);
  }

  const url = c.req.query("url");
  if (!url || !validateVideoUrl(url)) {
    return c.json({ error: "Invalid YouTube URL provided." }, 400);
  }

  const passThrough = new PassThrough();

  // Spawn yt-dlp
  // We use best[ext=mp4] to get a single pre-merged stream (usually 720p).
  // -o - pipes directly to stdout
  const ytdlp = spawn("yt-dlp", [
    "-f", "best[ext=mp4]/best",
    "-o", "-",
    "--max-filesize", "50M",
    url
  ]);

  ytdlp.stdout.pipe(passThrough);

  ytdlp.stderr.on("data", (data) => {
    // Keep logs internal, don't stream stderr to user
    console.log(`yt-dlp log: ${data.toString()}`);
  });

  ytdlp.on("error", (error) => {
    console.error("Failed to start yt-dlp:", error);
    passThrough.end();
  });

  ytdlp.on("close", (code) => {
    console.log(`yt-dlp exited with code ${code}`);
    passThrough.end();
  });

  // Set timeout to kill process if it runs too long (e.g. 60 seconds)
  setTimeout(() => {
    if (!ytdlp.killed) {
      console.log("yt-dlp timeout, killing process.");
      ytdlp.kill();
      passThrough.end();
    }
  }, 60000);

  // Return the stream to the client
  c.header("Content-Type", "video/mp4");
  c.header("Content-Disposition", "attachment; filename=\"stream.mp4\"");
  
  // @ts-ignore - Hono supports Node streams directly in the body
  return c.body(passThrough);
});

const port = 4000;
console.log(`API Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});

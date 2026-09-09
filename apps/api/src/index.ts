import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

// ─── Environment ──────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const IS_PROD = process.env.NODE_ENV === "production";

// ─── URL Validation ───────────────────────────────────────────────────────────
// Inline here because @freeclip/shared has no compiled output.
// The identical implementation lives in packages/shared/src/validation.ts for unit testing.

const ALLOWED_YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
]);

const SSRF_PATTERNS = [
  /localhost/i,
  /(^|\/|@)127\.\d+\.\d+\.\d+/,
  /(^|\/|@)192\.168\.\d+\.\d+/,
  /(^|\/|@)10\.\d+\.\d+\.\d+/,
  /(^|\/|@)172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/,
  /\[::1\]/i,
  /0\.0\.0\.0/,
  /169\.254\./,
];

export function validateVideoUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;
    if (!ALLOWED_YT_HOSTS.has(url.hostname)) return false;
    for (const pattern of SSRF_PATTERNS) {
      if (pattern.test(urlString)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────

interface LogFields {
  requestId: string;
  endpoint: string;
  status: "success" | "error";
  durationMs: number;
  source?: string;
  errorCode?: string;
  httpStatus?: number;
  [key: string]: unknown;
}

function log(fields: LogFields): void {
  if (IS_PROD) {
    // Structured single-line JSON for log aggregation
    console.log(JSON.stringify(fields));
  } else {
    // Human-readable key=value pairs for development
    const parts = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`);
    console.log(`[${fields.status === "error" ? "ERR" : "OK "}] ${parts.join(" ")}`);
  }
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, number[]>();

const RATE_LIMITS = {
  extract: { max: 5, windowMs: 60_000 },
  stream: { max: 3, windowMs: 60_000 }, // streaming is more expensive
} as const;

function isRateLimited(ip: string, type: keyof typeof RATE_LIMITS): boolean {
  const { max, windowMs } = RATE_LIMITS[type];
  const key = `${type}:${ip}`;
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) ?? [];
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= max) return true;

  valid.push(now);
  rateLimitMap.set(key, valid);
  return false;
}

// Periodically evict expired entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const type = key.split(":")[0] as keyof typeof RATE_LIMITS;
    const windowMs = RATE_LIMITS[type]?.windowMs ?? 60_000;
    const valid = timestamps.filter((t) => now - t < windowMs);
    if (valid.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, valid);
    }
  }
}, 60_000);



// ─── yt-dlp error mapping ─────────────────────────────────────────────────────

interface YtdlpError {
  code: string;
  message: string;
  httpStatus: number;
}

function mapYtdlpStderr(stderr: string): YtdlpError {
  const lower = stderr.toLowerCase();

  if (lower.includes("requested format is not available")) {
    return {
      code: "UNSUPPORTED_FORMAT",
      message: "Unsupported media. Could not find a compatible H.264/AAC MP4 format.",
      httpStatus: 400,
    };
  }
  if (
    lower.includes("video unavailable") ||
    lower.includes("this video is private") ||
    lower.includes("this video has been removed") ||
    lower.includes("no such video")
  ) {
    return {
      code: "VIDEO_NOT_FOUND",
      message: "Video not found. It may be private, removed, or unavailable in your region.",
      httpStatus: 404,
    };
  }
  if (lower.includes("sign in") || lower.includes("age-restricted")) {
    return {
      code: "VIDEO_NOT_FOUND",
      message: "This video requires sign-in or is age-restricted.",
      httpStatus: 403,
    };
  }
  if (lower.includes("429") || lower.includes("too many requests")) {
    return {
      code: "RATE_LIMITED",
      message: "YouTube is temporarily rate-limiting requests. Try again in a moment.",
      httpStatus: 429,
    };
  }

  return {
    code: "EXTRACTION_FAILED",
    message: "Failed to extract video information.",
    httpStatus: 500,
  };
}

// ─── Hono App ─────────────────────────────────────────────────────────────────

export const app = new Hono();

app.use("/*", cors());
app.use("/*", secureHeaders());

// Request logging middleware
app.use("*", async (c, next) => {
  const requestId = `req_${randomUUID().slice(0, 8)}`;
  const start = Date.now();

  // Attach requestId for downstream handlers to use
  c.set("requestId" as never, requestId);

  await next();

  const durationMs = Date.now() - start;
  const httpStatus = c.res.status;
  const isError = httpStatus >= 400;

  // Derive a clean endpoint name from the path
  const rawPath = c.req.path;
  const endpoint = rawPath.replace(/^\/api\//, "") || "root";

  log({
    requestId,
    endpoint,
    status: isError ? "error" : "success",
    durationMs,
    httpStatus,
  });
});

// Body size limit on extract endpoint only
app.use(
  "/api/extract",
  bodyLimit({
    maxSize: 10 * 1024, // 10 KB
    onError: (c) =>
      c.json(
        { success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Payload too large." } },
        413
      ),
  })
);

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Extract ──────────────────────────────────────────────────────────────────

const ExtractRequestSchema = z.object({
  url: z
    .string()
    .url()
    .refine((val) => validateVideoUrl(val), {
      message: "Invalid YouTube URL provided.",
    }),
});

app.post("/api/extract", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const requestId: string = (c.get as (key: string) => string)("requestId") ?? randomUUID().slice(0, 8);

  if (isRateLimited(ip, "extract")) {
    return c.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a minute." } },
      429
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { success: false, error: { code: "INVALID_REQUEST", message: "Invalid JSON body." } },
      400
    );
  }

  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_URL", message: parsed.error.issues[0].message } },
      400
    );
  }

  const { url } = parsed.data;

  // Spawn yt-dlp — arguments are passed as a discrete array (no shell interpolation)
  const ytdlp = spawn("yt-dlp", [
    "-f", "best[ext=mp4][vcodec^=avc][acodec^=mp4a]",
    "--dump-json",
    "--no-playlist",
    url,
  ]);

  let stdoutData = "";
  let stderrData = "";

  ytdlp.stdout.on("data", (d: Buffer) => { stdoutData += d.toString(); });
  ytdlp.stderr.on("data", (d: Buffer) => { stderrData += d.toString(); });

  return new Promise<Response>((resolve) => {
    const timer = setTimeout(() => {
      if (!ytdlp.killed) ytdlp.kill("SIGTERM");
      resolve(
        c.json(
          { success: false, error: { code: "TIMEOUT", message: "Extraction timed out. Please try again." } },
          504
        )
      );
    }, 20_000);

    ytdlp.on("close", (code: number | null) => {
      clearTimeout(timer);

      if (code !== 0) {
        if (!IS_PROD) {
          console.error(`[${requestId}] yt-dlp stderr:`, stderrData.slice(0, 500));
        }
        const { code: errCode, message, httpStatus } = mapYtdlpStderr(stderrData);
        return resolve(
          c.json({ success: false, error: { code: errCode, message } }, httpStatus as 400 | 403 | 404 | 429 | 500)
        );
      }

      try {
        const metadata = JSON.parse(stdoutData);

        // Server-side enforcement — never trust client validation
        if (metadata.duration > 60) {
          return resolve(
            c.json(
              { success: false, error: { code: "VIDEO_TOO_LONG", message: "Videos must be 60 seconds or shorter." } },
              400
            )
          );
        }

        const sizeBytes: number | undefined = metadata.filesize ?? metadata.filesize_approx;
        const MAX_BYTES = 50 * 1024 * 1024;
        if (sizeBytes && sizeBytes > MAX_BYTES) {
          return resolve(
            c.json(
              { success: false, error: { code: "VIDEO_TOO_LARGE", message: "Video file exceeds the 50 MB limit." } },
              400
            )
          );
        }

        resolve(
          c.json({
            success: true,
            title: metadata.title,
            duration: metadata.duration,
            thumbnail: metadata.thumbnail,
            id: metadata.id,
          })
        );
      } catch {
        resolve(
          c.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to parse video metadata." } },
            500
          )
        );
      }
    });
  });
});

// ─── Download / Proxy ─────────────────────────────────────────────────────────

app.get("/api/download", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  if (isRateLimited(ip, "stream")) {
    return c.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many streaming requests. Please wait a minute." } },
      429
    );
  }

  const rawUrl = c.req.query("url");
  const parsed = ExtractRequestSchema.safeParse({ url: rawUrl });
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_URL", message: parsed.error.issues[0].message } },
      400
    );
  }

  const { url } = parsed.data;

  try {
    // 1. Resolve direct media URL via yt-dlp (safe spawn — no shell)
    const directUrl = await new Promise<string>((resolve, reject) => {
      const ytdlp = spawn("yt-dlp", [
        "-f", "best[ext=mp4][vcodec^=avc][acodec^=mp4a]",
        "-g",
        "--no-playlist",
        url,
      ]);

      let out = "";
      ytdlp.stdout.on("data", (d: Buffer) => { out += d.toString(); });

      const timer = setTimeout(() => {
        if (!ytdlp.killed) ytdlp.kill("SIGTERM");
        reject(new Error("yt-dlp URL resolution timed out"));
      }, 20_000);

      ytdlp.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (code === 0 && out.trim()) {
          resolve(out.trim());
        } else {
          reject(new Error("Failed to resolve direct media URL"));
        }
      });
    });

    // 2. Forward Range header to YouTube CDN
    const fetchHeaders = new Headers();
    const rangeHeader = c.req.header("Range");
    if (rangeHeader) fetchHeaders.set("Range", rangeHeader);

    // Required by YouTube CDN to avoid 403 on some streams
    fetchHeaders.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Abort upstream fetch if client disconnects or after 60 s
    const ac = new AbortController();
    const upstreamTimeout = setTimeout(() => ac.abort(), 60_000);

    let ytResponse: Response;
    try {
      ytResponse = await fetch(directUrl, {
        method: "GET",
        headers: fetchHeaders,
        signal: ac.signal,
      });
    } finally {
      clearTimeout(upstreamTimeout);
    }

    if (!ytResponse.ok && ytResponse.status !== 206) {
      throw new Error(`Upstream returned ${ytResponse.status}`);
    }

    // 3. Build proxy response — copy only safe headers
    const proxyHeaders = new Headers();
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const val = ytResponse.headers.get(h);
      if (val) proxyHeaders.set(h, val);
    }
    // Force correct MIME type
    proxyHeaders.set("Content-Type", "video/mp4");

    return new Response(ytResponse.body, {
      status: ytResponse.status,
      headers: proxyHeaders,
    });
  } catch (error: unknown) {
    const isDev = !IS_PROD;
    if (isDev) console.error("Streaming error:", error);
    return c.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Failed to stream media." } },
      500
    );
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
// Skip server startup when imported by Vitest (allows unit testing exports)

if (!process.env.VITEST) {
  console.log(`FreeClip API starting on port ${PORT} (${IS_PROD ? "production" : "development"})`);
  serve({ fetch: app.fetch, port: PORT });
}


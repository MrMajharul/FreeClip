import { describe, it, expect } from "vitest";
import { app, validateVideoUrl } from "../index.js";

// Integration tests hit Hono's in-memory app.request() by default,
// or a real running server if API_TEST_URL is provided.
async function req(path: string, init?: RequestInit): Promise<Response> {
  if (process.env.API_TEST_URL) {
    return fetch(`${process.env.API_TEST_URL}${path}`, init);
  }
  return app.request(path, init);
}

// ─── Validation unit tests (no server needed) ─────────────────────────────────

describe("validateVideoUrl — unit", () => {
  it("allows valid YouTube HTTPS URLs", () => {
    expect(validateVideoUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(validateVideoUrl("https://youtu.be/abc")).toBe(true);
  });

  it("blocks non-HTTPS", () => {
    expect(validateVideoUrl("http://www.youtube.com/watch?v=abc")).toBe(false);
  });

  it("blocks SSRF via credentials", () => {
    expect(validateVideoUrl("https://youtube.com@127.0.0.1/")).toBe(false);
  });

  it("blocks private IP ranges", () => {
    expect(validateVideoUrl("https://192.168.1.1/")).toBe(false);
    expect(validateVideoUrl("https://10.0.0.1/")).toBe(false);
    expect(validateVideoUrl("https://172.16.0.1/")).toBe(false);
  });

  it("blocks non-YouTube domains", () => {
    expect(validateVideoUrl("https://vimeo.com/123")).toBe(false);
    expect(validateVideoUrl("https://youtube.com.evil.com/")).toBe(false);
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with status ok and timestamp", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });
});

// ─── Extract endpoint ─────────────────────────────────────────────────────────

describe("POST /api/extract", () => {
  // Use unique per-test IPs to avoid cross-test rate limiting
  function uniqueIp(suffix: number): string {
    return `203.0.113.${suffix}`; // TEST-NET-3, RFC 5737 — never real
  }

  it("rejects empty body with 400", async () => {
    const res = await req("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": uniqueIp(1) },
      body: "{}",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  it("rejects non-YouTube URL with INVALID_URL", async () => {
    const res = await req("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": uniqueIp(2) },
      body: JSON.stringify({ url: "https://vimeo.com/123456" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as Record<string, unknown>)?.code).toBe("INVALID_URL");
  });

  it("rejects http:// YouTube URL with INVALID_URL", async () => {
    const res = await req("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": uniqueIp(3) },
      body: JSON.stringify({ url: "http://www.youtube.com/watch?v=abc" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  it("rejects SSRF attempt with INVALID_URL", async () => {
    const res = await req("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": uniqueIp(4) },
      body: JSON.stringify({ url: "https://youtube.com@127.0.0.1/" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as Record<string, unknown>)?.code).toBe("INVALID_URL");
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await req("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": uniqueIp(5) },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  it("returns 429 after exceeding rate limit from same IP", async () => {
    // Use a unique IP for this test to avoid cross-test contamination
    const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`; // TEST-NET-2, RFC 5737

    // Make 6 requests; the 6th should be rate-limited (limit is 5/min)
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await req("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": testIp,
        },
        body: JSON.stringify({ url: "https://vimeo.com/invalid" }), // gets rejected at validation (400) for first 5
      });
      results.push(r.status);
      if (r.status === 429) break;
    }

    // The first 5 should be 400 (validation error), 6th should be 429
    expect(results).toContain(429);
  }, 15_000);
});

// ─── Download endpoint ────────────────────────────────────────────────────────

describe("GET /api/download", () => {
  function uniqueIp(suffix: number): string {
    return `192.0.2.${suffix}`; // TEST-NET-1, RFC 5737
  }

  it("rejects missing url param with 400", async () => {
    const res = await req("/api/download", {
      headers: { "X-Forwarded-For": uniqueIp(10) },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  it("rejects non-YouTube url with INVALID_URL", async () => {
    const url = encodeURIComponent("https://evil.com/video.mp4");
    const res = await req(`/api/download?url=${url}`, {
      headers: { "X-Forwarded-For": uniqueIp(11) },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  it("rejects SSRF attempt in url param with INVALID_URL", async () => {
    const url = encodeURIComponent("https://youtube.com@192.168.1.1/");
    const res = await req(`/api/download?url=${url}`, {
      headers: { "X-Forwarded-For": uniqueIp(12) },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as Record<string, unknown>)?.code).toBe("INVALID_URL");
  });
});

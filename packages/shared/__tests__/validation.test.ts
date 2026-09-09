import { describe, it, expect } from "vitest";
import { validateVideoUrl } from "../src/validation";

// ─── URL Validation (SSRF + domain allowlist) ─────────────────────────────────

describe("validateVideoUrl", () => {
  // ── Allowed URLs ────────────────────────────────────────────────────────────
  it("accepts standard youtube.com watch URL", () => {
    expect(validateVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts youtu.be short URL", () => {
    expect(validateVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts m.youtube.com mobile URL", () => {
    expect(validateVideoUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  // ── Protocol rejection ───────────────────────────────────────────────────────
  it("rejects http:// URLs (insecure)", () => {
    expect(validateVideoUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
  });

  it("rejects file:// URLs", () => {
    expect(validateVideoUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects ftp:// URLs", () => {
    expect(validateVideoUrl("ftp://youtube.com/video")).toBe(false);
  });

  // ── Domain rejection ─────────────────────────────────────────────────────────
  it("rejects non-YouTube domains", () => {
    expect(validateVideoUrl("https://vimeo.com/123456")).toBe(false);
  });

  it("rejects youtube.com.evil.com", () => {
    expect(validateVideoUrl("https://youtube.com.evil.com/watch?v=abc")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateVideoUrl("")).toBe(false);
  });

  it("rejects malformed URL", () => {
    expect(validateVideoUrl("not-a-url")).toBe(false);
  });

  // ── SSRF rejection ───────────────────────────────────────────────────────────
  it("rejects localhost in URL", () => {
    expect(validateVideoUrl("https://localhost/watch?v=abc")).toBe(false);
  });

  it("rejects 127.0.0.1 in URL", () => {
    expect(validateVideoUrl("https://127.0.0.1/watch?v=abc")).toBe(false);
  });

  it("rejects credentials trick: youtube.com@127.0.0.1", () => {
    expect(validateVideoUrl("https://youtube.com@127.0.0.1/watch?v=abc")).toBe(false);
  });

  it("rejects 192.168.x.x private range", () => {
    expect(validateVideoUrl("https://192.168.1.1/watch?v=abc")).toBe(false);
  });

  it("rejects 10.x.x.x private range", () => {
    expect(validateVideoUrl("https://10.0.0.1/resource")).toBe(false);
  });

  it("rejects 172.16–31 private range", () => {
    expect(validateVideoUrl("https://172.16.0.1/resource")).toBe(false);
  });

  it("rejects [::1] IPv6 localhost", () => {
    expect(validateVideoUrl("https://[::1]/watch?v=abc")).toBe(false);
  });

  it("rejects 0.0.0.0", () => {
    expect(validateVideoUrl("https://0.0.0.0/watch?v=abc")).toBe(false);
  });

  // ── Size/duration limits (enforced at API level, not URL level) ──────────────
  it("accepts valid YouTube URL regardless of query params", () => {
    expect(validateVideoUrl("https://www.youtube.com/watch?v=abc123&t=30")).toBe(true);
  });

  it("accepts playlist URL (playlist filtering done by yt-dlp --no-playlist)", () => {
    expect(validateVideoUrl("https://www.youtube.com/watch?v=abc&list=PLxyz")).toBe(true);
  });
});

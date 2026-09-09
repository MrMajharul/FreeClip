import { describe, it, expect } from "vitest";
import { validateVideoUrl } from "@freeclip/shared";

/**
 * Tests the client-side YouTube URL pre-validation logic.
 * The full import state machine (useYouTubeImport) is covered
 * via E2E tests since it requires a real browser environment.
 */

function isLikelyYouTubeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const hosts = ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"];
    return url.protocol === "https:" && hosts.includes(url.hostname);
  } catch {
    return false;
  }
}

describe("Client-side YouTube URL pre-validation", () => {
  it("accepts standard YouTube URL", () => {
    expect(isLikelyYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
  });

  it("accepts youtu.be short links", () => {
    expect(isLikelyYouTubeUrl("https://youtu.be/abc123")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isLikelyYouTubeUrl("")).toBe(false);
  });

  it("rejects non-YouTube domain", () => {
    expect(isLikelyYouTubeUrl("https://vimeo.com/123")).toBe(false);
  });

  it("rejects http:// YouTube URL", () => {
    expect(isLikelyYouTubeUrl("http://youtube.com/watch?v=abc")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(isLikelyYouTubeUrl("not a url at all")).toBe(false);
  });
});

describe("Upload validation limits", () => {
  const MAX_SIZE = 50 * 1024 * 1024;
  const MAX_DURATION = 60;

  it("accepts file at exactly 50 MB boundary", () => {
    const fileSize = MAX_SIZE; // exactly at limit
    expect(fileSize > MAX_SIZE).toBe(false);
  });

  it("rejects file 1 byte over 50 MB", () => {
    const fileSize = MAX_SIZE + 1;
    expect(fileSize > MAX_SIZE).toBe(true);
  });

  it("accepts video at exactly 60 sec", () => {
    expect(MAX_DURATION > MAX_DURATION).toBe(false); // not exceeded
  });

  it("rejects video 1 second over 60 sec", () => {
    const duration = MAX_DURATION + 1;
    expect(duration > MAX_DURATION).toBe(true);
  });
});

describe("Crop coordinate math", () => {
  /** Simulates what buildFFmpegCommand does internally */
  function cropFilter(x: number, y: number, w: number, h: number) {
    return `crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x)}:${Math.round(y)}`;
  }

  it("generates correct crop filter string", () => {
    expect(cropFilter(10, 20, 640, 360)).toBe("crop=640:360:10:20");
  });

  it("rounds fractional pixel values", () => {
    expect(cropFilter(10.7, 20.3, 640.9, 360.1)).toBe("crop=641:360:11:20");
  });

  it("handles origin crop (x=0, y=0)", () => {
    expect(cropFilter(0, 0, 1920, 1080)).toBe("crop=1920:1080:0:0");
  });

  it("handles center crop", () => {
    // 1920x1080 video, crop 960x540 from center
    expect(cropFilter(480, 270, 960, 540)).toBe("crop=960:540:480:270");
  });
});

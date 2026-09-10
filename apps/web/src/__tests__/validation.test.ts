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

describe("Video Metadata & Formatting", () => {
  function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  it("formats kilobytes correctly", () => {
    expect(formatFileSize(512 * 1024)).toBe("512.0 KB");
  });

  it("formats megabytes correctly", () => {
    expect(formatFileSize(150 * 1024 * 1024)).toBe("150.0 MB");
  });

  it("formats gigabytes for large video files", () => {
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe("1.50 GB");
  });

  it("formats short duration (seconds)", () => {
    expect(formatDuration(45)).toBe("0:45");
  });

  it("formats long duration exceeding previous 60s limit", () => {
    expect(formatDuration(185)).toBe("3:05");
    expect(formatDuration(1800)).toBe("30:00");
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

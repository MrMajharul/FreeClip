import { describe, it, expect } from "vitest";
import { buildFFmpegCommand } from "../src/ffmpeg/buildCommand";
import type { CropData } from "../src/types";

// ─── buildFFmpegCommand ───────────────────────────────────────────────────────

describe("buildFFmpegCommand", () => {
  const base = { inputFilename: "input.mp4", outputFilename: "output.mp4" };

  it("includes -i with the input filename", () => {
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 10, crop: null });
    expect(args).toContain("-i");
    expect(args[args.indexOf("-i") + 1]).toBe("input.mp4");
  });

  it("sets -ss and -t correctly for a trim", () => {
    const args = buildFFmpegCommand({ ...base, startTime: 5, endTime: 15, crop: null });
    const ssIdx = args.indexOf("-ss");
    const tIdx = args.indexOf("-t");
    expect(ssIdx).toBeGreaterThan(-1);
    expect(tIdx).toBeGreaterThan(-1);
    expect(parseFloat(args[ssIdx + 1])).toBeCloseTo(5, 2);
    expect(parseFloat(args[tIdx + 1])).toBeCloseTo(10, 2); // endTime - startTime
  });

  it("produces a duration of endTime - startTime", () => {
    const args = buildFFmpegCommand({ ...base, startTime: 2.5, endTime: 8.75, crop: null });
    const tIdx = args.indexOf("-t");
    expect(parseFloat(args[tIdx + 1])).toBeCloseTo(6.25, 2);
  });

  it("does not include -vf when crop is null", () => {
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 10, crop: null });
    expect(args).not.toContain("-vf");
  });

  it("includes correct crop filter when crop is provided", () => {
    const crop: CropData = { x: 10, y: 20, width: 640, height: 360 };
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 10, crop });
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThan(-1);
    const filter = args[vfIdx + 1];
    expect(filter).toBe("crop=640:360:10:20");
  });

  it("rounds crop coordinates to integers", () => {
    const crop: CropData = { x: 10.7, y: 20.3, width: 640.9, height: 360.1 };
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 10, crop });
    const vfIdx = args.indexOf("-vf");
    const filter = args[vfIdx + 1];
    expect(filter).toBe("crop=641:360:11:20");
  });

  it("uses libx264 video codec", () => {
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 10, crop: null });
    const cvIdx = args.indexOf("-c:v");
    expect(cvIdx).toBeGreaterThan(-1);
    expect(args[cvIdx + 1]).toBe("libx264");
  });

  it("includes -movflags +faststart for web playback", () => {
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 10, crop: null });
    expect(args).toContain("-movflags");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
  });

  it("ends with the output filename", () => {
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 10, crop: null });
    expect(args[args.length - 1]).toBe("output.mp4");
  });

  it("handles zero startTime correctly", () => {
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 60, crop: null });
    const ssIdx = args.indexOf("-ss");
    expect(parseFloat(args[ssIdx + 1])).toBeCloseTo(0, 2);
  });

  it("handles edge crop at x=0, y=0", () => {
    const crop: CropData = { x: 0, y: 0, width: 1920, height: 1080 };
    const args = buildFFmpegCommand({ ...base, startTime: 0, endTime: 10, crop });
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toBe("crop=1920:1080:0:0");
  });
});

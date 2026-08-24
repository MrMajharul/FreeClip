import { CropData } from "../types";

export interface BuildCommandParams {
  inputFilename: string;
  outputFilename: string;
  startTime: number;
  endTime: number;
  crop: CropData | null;
}

export function buildFFmpegCommand({
  inputFilename,
  outputFilename,
  startTime,
  endTime,
  crop
}: BuildCommandParams): string[] {
  const args: string[] = [];

  // Input
  args.push("-i", inputFilename);

  // Trim (applied after input for speed, or before. Standard is before if just copying, but for filtering we can put it after)
  const duration = (endTime - startTime).toFixed(2);
  args.push("-ss", startTime.toFixed(2));
  args.push("-t", duration);

  // Filters
  if (crop) {
    const { x, y, width, height } = crop;
    // crop=w:h:x:y
    const cropFilter = `crop=${Math.round(width)}:${Math.round(height)}:${Math.round(x)}:${Math.round(y)}`;
    args.push("-vf", cropFilter);
  }

  // Video Codec
  args.push("-c:v", "libx264");
  args.push("-preset", "fast"); // Speed up web worker encoding
  
  // Audio Codec
  // By omitting -c:a, we allow FFmpeg to use the default for mp4 (aac) if an audio stream exists, 
  // and gracefully do nothing if the video has no audio track.
  
  // Fast start for web playback
  args.push("-movflags", "+faststart");

  // Output
  args.push(outputFilename);

  return args;
}

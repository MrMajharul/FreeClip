// ─── FFmpeg Worker Message Types ─────────────────────────────────────────────

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WorkerMessage =
  | { type: "INIT" }
  | {
      type: "PROCESS";
      fileData: ArrayBuffer;
      fileName: string;
      startTime: number;
      endTime: number;
      crop: CropData | null;
      totalDuration?: number;
    }
  | { type: "CANCEL" };

export type WorkerResponse =
  | { type: "READY" }
  | { type: "PROGRESS"; progress: number }
  | { type: "COMPLETE"; data: ArrayBuffer }
  | { type: "ERROR"; message: string }
  | { type: "CANCELLED" };

// ─── Video Metadata & Source ───────────────────────────────────────────────────

export interface VideoMetadata {
  name: string;
  size: number;
  type: string;
  duration: number;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface VideoEditState {
  trim: {
    start: number;
    end: number;
  };
  crop: CropData | null;
}

/**
 * Normalized representation of a video source.
 * The VideoEditor consumes this — it does not care whether the video
 * came from a local upload or a YouTube import.
 */
export type VideoSourceType = "local" | "youtube";

export interface VideoSource {
  type: VideoSourceType;
  /** The raw File or Blob used by FFmpeg.wasm for processing */
  file: File;
  /** Object URL for video preview (must be revoked on cleanup) */
  url: string;
  /** Display name */
  name: string;
  /** Duration in seconds */
  duration: number;
  /** Optional rich metadata */
  metadata?: VideoMetadata;
  /** Optional dimensional metadata */
  width?: number;
  height?: number;
  /** File size in bytes */
  size?: number;
}

// ─── YouTube Import State Machine ─────────────────────────────────────────────

export type ImportPhase =
  | "IDLE"
  | "VALIDATING"
  | "FETCHING_METADATA"
  | "PREPARING_VIDEO"
  | "EDITOR_READY"
  | "ERROR";

/** Error codes surfaced to the user — no raw server errors leak through */
export type ImportErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_DOMAIN"
  | "VIDEO_NOT_FOUND"
  | "VIDEO_TOO_LONG"
  | "VIDEO_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "NETWORK_ERROR"
  | "BACKEND_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UNKNOWN";

export interface ImportState {
  phase: ImportPhase;
  errorCode?: ImportErrorCode;
  errorMessage?: string;
  metadata?: {
    title: string;
    duration: number;
    thumbnail: string;
    id: string;
  };
}

// ─── API Contract ─────────────────────────────────────────────────────────────

/** Shape of a successful /api/extract response */
export interface ExtractSuccessResponse {
  success: true;
  title: string;
  duration: number;
  thumbnail: string;
  id: string;
}

/** Shape of an error response from any API endpoint */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ExtractResponse = ExtractSuccessResponse | ApiErrorResponse;

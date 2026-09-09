"use client";

import { useCallback, useReducer, useRef } from "react";
import type {
  ImportState,
  ImportPhase,
  ImportErrorCode,
  VideoSource,
  ExtractResponse,
} from "@freeclip/shared";
import { perf } from "@/lib/perf";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

const EXTRACT_TIMEOUT_MS = 20_000; // 20 s for metadata
const DOWNLOAD_TIMEOUT_MS = 90_000; // 90 s for video blob download

// ─── State Machine ────────────────────────────────────────────────────────────

type ImportAction =
  | { type: "VALIDATE" }
  | { type: "FETCH_METADATA" }
  | {
      type: "METADATA_OK";
      metadata: NonNullable<ImportState["metadata"]>;
    }
  | { type: "PREPARE_VIDEO" }
  | { type: "EDITOR_READY" }
  | { type: "ERROR"; errorCode: ImportErrorCode; errorMessage: string }
  | { type: "RESET" };

const initialState: ImportState = { phase: "IDLE" };

function reducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case "VALIDATE":
      return { phase: "VALIDATING" };
    case "FETCH_METADATA":
      return { phase: "FETCHING_METADATA" };
    case "METADATA_OK":
      return { phase: "FETCHING_METADATA", metadata: action.metadata };
    case "PREPARE_VIDEO":
      return { phase: "PREPARING_VIDEO", metadata: state.metadata };
    case "EDITOR_READY":
      return { phase: "EDITOR_READY", metadata: state.metadata };
    case "ERROR":
      return {
        phase: "ERROR",
        errorCode: action.errorCode,
        errorMessage: action.errorMessage,
        metadata: state.metadata,
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// ─── Error Mapping ────────────────────────────────────────────────────────────

/** Map an API error code (from server) to our ImportErrorCode + friendly message */
function mapApiError(code: string, serverMessage: string): { errorCode: ImportErrorCode; errorMessage: string } {
  switch (code) {
    case "INVALID_URL":
      return { errorCode: "INVALID_URL", errorMessage: "That doesn't look like a valid YouTube URL." };
    case "VIDEO_TOO_LONG":
      return { errorCode: "VIDEO_TOO_LONG", errorMessage: "Videos must be 60 seconds or shorter." };
    case "VIDEO_TOO_LARGE":
      return { errorCode: "VIDEO_TOO_LARGE", errorMessage: "Video exceeds the 50 MB size limit." };
    case "UNSUPPORTED_FORMAT":
      return { errorCode: "UNSUPPORTED_FORMAT", errorMessage: "This video format isn't supported. Try another video." };
    case "RATE_LIMITED":
      return { errorCode: "RATE_LIMITED", errorMessage: "Too many requests. Please wait a minute and try again." };
    case "VIDEO_NOT_FOUND":
      return { errorCode: "VIDEO_NOT_FOUND", errorMessage: "Video not found. It may be private or unavailable." };
    case "EXTRACTION_FAILED":
    case "UPSTREAM_ERROR":
      return { errorCode: "BACKEND_ERROR", errorMessage: "Could not process this video. Please try another." };
    case "PAYLOAD_TOO_LARGE":
      return { errorCode: "INVALID_URL", errorMessage: "URL is too long." };
    default:
      // Do NOT leak raw server messages to the user
      return { errorCode: "UNKNOWN", errorMessage: "Something went wrong. Please try again." };
  }
}

/** Detect client-side errors (network, abort, timeout) */
function mapFetchError(err: unknown, isTimeout: boolean): { errorCode: ImportErrorCode; errorMessage: string } {
  if (isTimeout) {
    return { errorCode: "TIMEOUT", errorMessage: "Request timed out. Check your connection and try again." };
  }
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return { errorCode: "NETWORK_ERROR", errorMessage: "Network error. Check your connection and try again." };
  }
  return { errorCode: "UNKNOWN", errorMessage: "Something went wrong. Please try again." };
}

/** Quick client-side YouTube URL format check before hitting the server */
function isLikelyYouTubeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const hosts = ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"];
    return url.protocol === "https:" && hosts.includes(url.hostname);
  } catch {
    return false;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseYouTubeImportReturn {
  importState: ImportState;
  /** Kick off the full import flow (validate → fetch metadata → prepare video) */
  startImport: (url: string) => Promise<VideoSource | null>;
  /** Confirm metadata and begin video download (called after user reviews metadata) */
  confirmImport: (url: string) => Promise<VideoSource | null>;
  /** Reset state back to IDLE */
  reset: () => void;
}

export function useYouTubeImport(): UseYouTubeImportReturn {
  const [importState, dispatch] = useReducer(reducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    dispatch({ type: "RESET" });
    perf.reset();
  }, []);

  /**
   * Phase 1: Validate URL client-side, then fetch metadata from the API.
   * Returns the metadata on success, null on failure.
   */
  const startImport = useCallback(async (url: string): Promise<VideoSource | null> => {
    // ── Client-side validation ──────────────────────────────────────────────
    dispatch({ type: "VALIDATE" });
    perf.mark("URL_SUBMITTED");

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      dispatch({ type: "ERROR", errorCode: "INVALID_URL", errorMessage: "Please enter a YouTube URL." });
      return null;
    }

    if (!isLikelyYouTubeUrl(trimmedUrl)) {
      dispatch({
        type: "ERROR",
        errorCode: "UNSUPPORTED_DOMAIN",
        errorMessage: "Only YouTube URLs are supported (youtube.com or youtu.be).",
      });
      return null;
    }

    // ── Metadata fetch ──────────────────────────────────────────────────────
    dispatch({ type: "FETCH_METADATA" });
    perf.mark("API_REQUEST_STARTED");

    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    const timeoutId = setTimeout(() => ac.abort(), EXTRACT_TIMEOUT_MS);
    let isTimeout = false;

    try {
      const response = await fetch(`${API_BASE}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
        signal: ac.signal,
      });

      clearTimeout(timeoutId);
      perf.mark("METADATA_RECEIVED");

      const data: ExtractResponse = await response.json();

      if (!response.ok || !data.success) {
        const errData = data as { success: false; error: { code: string; message: string } };
        const mapped = mapApiError(errData.error?.code ?? "", errData.error?.message ?? "");
        dispatch({ type: "ERROR", ...mapped });
        return null;
      }

      const { title, duration, thumbnail, id } = data;
      dispatch({ type: "METADATA_OK", metadata: { title, duration, thumbnail, id } });

      // Return null here — the caller will show metadata preview
      // and call confirmImport() when the user clicks "Start Editing"
      return null;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        isTimeout = true;
      }
      const mapped = mapFetchError(err, isTimeout);
      dispatch({ type: "ERROR", ...mapped });
      return null;
    }
  }, []);

  /**
   * Phase 2: Download the video blob and build a VideoSource.
   * Called after user confirms the metadata preview.
   */
  const confirmImport = useCallback(async (url: string): Promise<VideoSource | null> => {
    if (!importState.metadata) return null;

    dispatch({ type: "PREPARE_VIDEO" });
    perf.mark("MEDIA_LOADING_STARTED");

    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    const timeoutId = setTimeout(() => ac.abort(), DOWNLOAD_TIMEOUT_MS);
    let isTimeout = false;

    try {
      const downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(url.trim())}`;

      // Retry up to 3 times for transient failures
      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch(downloadUrl, { signal: ac.signal });
          if (response.ok || (response.status < 500 && response.status !== 429)) break;
        } catch (e) {
          if (attempt === 2) throw e;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      if (!response || !response.ok) {
        let errorCode: ImportErrorCode = "BACKEND_ERROR";
        let errorMessage = "Failed to load video. Please try again.";
        if (response?.status === 429) {
          errorCode = "RATE_LIMITED";
          errorMessage = "Too many requests. Please wait a minute.";
        }
        clearTimeout(timeoutId);
        dispatch({ type: "ERROR", errorCode, errorMessage });
        return null;
      }

      const blob = await response.blob();
      clearTimeout(timeoutId);
      perf.mark("FIRST_VIDEO_FRAME");

      const { title, duration, id } = importState.metadata;
      const fileName = `${id}.mp4`;
      const file = new File([blob], fileName, { type: "video/mp4" });
      const objectUrl = URL.createObjectURL(file);

      const source: VideoSource = {
        type: "youtube",
        file,
        url: objectUrl,
        name: title,
        duration,
        size: blob.size,
      };

      dispatch({ type: "EDITOR_READY" });
      perf.mark("EDITOR_READY");
      perf.summary("YouTube Import Pipeline");

      return source;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        isTimeout = true;
      }
      const mapped = mapFetchError(err, isTimeout);
      dispatch({ type: "ERROR", ...mapped });
      return null;
    }
  }, [importState.metadata]);

  return { importState, startImport, confirmImport, reset };
}

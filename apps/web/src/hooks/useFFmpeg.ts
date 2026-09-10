import { useState, useRef, useCallback } from "react";
import { WorkerMessage, WorkerResponse, CropData } from "@freeclip/shared";
import { perf } from "@/lib/perf";

export type ExportState =
  | "idle"
  | "initializing"
  | "ready"
  | "processing"
  | "complete"
  | "error"
  | "cancelled";

// ─── Error mapping ────────────────────────────────────────────────────────────

const ERROR_MAP: Record<string, string> = {
  MEM: "Your browser does not have enough memory to process this video. Try a smaller file or close other tabs.",
  FORMAT: "This video format is not supported by your browser.",
  DECODE: "FreeClip could not process this video. Try another supported video format.",
  INIT: "Video engine could not be initialized.",
  DEFAULT: "Export failed. Your original video is safe. Try again or use a smaller video.",
};

function mapErrorMessage(rawError: string): string {
  const lower = rawError.toLowerCase();
  if (
    lower.includes("memory") ||
    lower.includes("aborted(oom") ||
    lower.includes("out of memory") ||
    lower.includes("allocation") ||
    lower.includes("out of bounds") ||
    lower.includes("cannot allocate")
  ) {
    return ERROR_MAP.MEM;
  }
  if (lower.includes("format") || lower.includes("codec") || lower.includes("unsupported")) {
    return ERROR_MAP.FORMAT;
  }
  if (lower.includes("decode") || lower.includes("demux") || lower.includes("corrupt")) {
    return ERROR_MAP.DECODE;
  }
  if (lower.includes("not loaded") || lower.includes("init")) {
    return ERROR_MAP.INIT;
  }
  return ERROR_MAP.DEFAULT;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFFmpeg() {
  const workerRef = useRef<Worker | null>(null);
  // Store outputUrl in a ref as well as state so cleanupWorker always sees
  // the current value, avoiding the stale-closure bug where the URL captured
  // at creation time is never revoked.
  const outputUrlRef = useRef<string | null>(null);

  const [exportState, setExportState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Helper: revoke the current output URL if one exists
  const revokeOutputUrl = useCallback(() => {
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = null;
      setOutputUrl(null);
    }
  }, []);

  const cleanupWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    // Always revoke via the ref — not a stale closure value
    revokeOutputUrl();
  }, [revokeOutputUrl]);

  const initWorker = useCallback(() => {
    if (workerRef.current) return;
    setExportState("initializing");

    workerRef.current = new Worker(
      new URL("../workers/ffmpeg.worker.ts", import.meta.url),
      { type: "module" }
    );

    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data;
      switch (res.type) {
        case "READY":
          setExportState("ready");
          break;

        case "PROGRESS":
          setProgress(Math.round(Math.max(0, Math.min(100, res.progress * 100))));
          if (res.progress === 0) perf.mark("PROCESSING_STARTED");
          break;

        case "COMPLETE": {
          const blob = new Blob([res.data], { type: "video/mp4" });
          const url = URL.createObjectURL(blob);
          // Keep ref in sync so cleanupWorker can always revoke it
          outputUrlRef.current = url;
          setOutputUrl(url);
          setExportState("complete");
          break;
        }

        case "ERROR":
          // Keep raw error in dev logs; never expose to users
          console.error("FFmpeg Worker Error Details:", res.message);
          setErrorMsg(mapErrorMessage(res.message));
          setExportState("error");
          // Terminate crashed worker
          if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
          }
          break;

        case "CANCELLED":
          setExportState("cancelled");
          if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
          }
          break;
      }
    };

    workerRef.current.postMessage({ type: "INIT" } as WorkerMessage);
  }, []);

  const processVideo = useCallback(
    async (
      file: File,
      startTime: number,
      endTime: number,
      crop: CropData | null,
      totalDuration?: number
    ) => {
      if (!workerRef.current || exportState !== "ready") {
        console.warn("Worker not ready yet.");
        return;
      }

      setExportState("processing");
      setProgress(0);
      setErrorMsg(null);
      // Revoke any previous output URL before starting a new export
      revokeOutputUrl();

      let arrayBuffer: ArrayBuffer;
      try {
        // Guard against file allocations exceeding browser memory limits
        if (file.size > 2 * 1024 * 1024 * 1024) {
          throw new RangeError("File exceeds browser WebAssembly memory limit (2 GB).");
        }
        arrayBuffer = await file.arrayBuffer();
      } catch (err: unknown) {
        console.error("ArrayBuffer allocation error:", err);
        setExportState("error");
        setErrorMsg(
          "Your browser does not have enough memory to process this video. Try a smaller file or close other tabs."
        );
        return;
      }

      workerRef.current.postMessage(
        {
          type: "PROCESS",
          fileData: arrayBuffer,
          fileName: file.name,
          startTime,
          endTime,
          crop,
          totalDuration,
        } as WorkerMessage,
        [arrayBuffer]
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exportState, revokeOutputUrl]
  );

  const cancelExport = useCallback(() => {
    if (workerRef.current && exportState === "processing") {
      workerRef.current.postMessage({ type: "CANCEL" } as WorkerMessage);
    }
  }, [exportState]);

  const resetState = useCallback(() => {
    setExportState("idle");
    setProgress(0);
    setErrorMsg(null);
    revokeOutputUrl();
  }, [revokeOutputUrl]);

  return {
    exportState,
    progress,
    outputUrl,
    errorMsg,
    initWorker,
    processVideo,
    cancelExport,
    resetState,
    cleanupWorker,
  };
}

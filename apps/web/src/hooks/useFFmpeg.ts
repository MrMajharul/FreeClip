import { useState, useRef, useCallback } from "react";
import { WorkerMessage, WorkerResponse, CropData } from "@freeclip/shared";

export type ExportState = "idle" | "initializing" | "ready" | "processing" | "complete" | "error" | "cancelled";

const ERROR_MAP: Record<string, string> = {
  "MEM": "This video is too demanding for your browser memory. Try a smaller video.",
  "FORMAT": "Unable to process this video format. Please try another video.",
  "INIT": "Video engine could not be initialized.",
  "DEFAULT": "Video processing failed. Please try again."
};

function mapErrorMessage(rawError: string): string {
  const lower = rawError.toLowerCase();
  if (lower.includes("memory") || lower.includes("aborted(oom") || lower.includes("out of memory")) {
    return ERROR_MAP.MEM;
  }
  if (lower.includes("format") || lower.includes("codec")) {
    return ERROR_MAP.FORMAT;
  }
  if (lower.includes("not loaded") || lower.includes("init")) {
    return ERROR_MAP.INIT;
  }
  return ERROR_MAP.DEFAULT;
}

export function useFFmpeg() {
  const workerRef = useRef<Worker | null>(null);
  
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initWorker = useCallback(() => {
    if (workerRef.current) return;
    setExportState("initializing");
    
    // In Next.js, workers are instantiated using new URL relative to import.meta.url
    workerRef.current = new Worker(new URL("../workers/ffmpeg.worker.ts", import.meta.url), {
      type: "module",
    });

    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data;
      switch (res.type) {
        case "READY":
          setExportState("ready");
          break;
        case "PROGRESS":
          // Ensure it's between 0-100
          setProgress(Math.round(Math.max(0, Math.min(100, res.progress * 100))));
          break;
        case "COMPLETE":
          const blob = new Blob([res.data], { type: "video/mp4" });
          const url = URL.createObjectURL(blob);
          setOutputUrl(url);
          setExportState("complete");
          break;
        case "ERROR":
          console.error("FFmpeg Worker Error Details:", res.message); // Keep dev logs
          setErrorMsg(mapErrorMessage(res.message));
          setExportState("error");
          cleanupWorker();
          break;
        case "CANCELLED":
          setExportState("cancelled");
          cleanupWorker();
          break;
      }
    };

    workerRef.current.postMessage({ type: "INIT" } as WorkerMessage);
  }, []);

  const cleanupWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    // Cleanup generated object URL to prevent memory leaks on unmount
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
    }
  }, [outputUrl]);

  const processVideo = useCallback(async (
    file: File,
    startTime: number,
    endTime: number,
    crop: CropData | null
  ) => {
    if (!workerRef.current || exportState !== "ready") {
      console.warn("Worker not ready yet.");
      return;
    }
    
    setExportState("processing");
    setProgress(0);
    setErrorMsg(null);
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      setOutputUrl(null);
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    workerRef.current.postMessage({
      type: "PROCESS",
      fileData: arrayBuffer,
      fileName: file.name,
      startTime,
      endTime,
      crop
    } as WorkerMessage, [arrayBuffer]);
  }, [exportState, outputUrl]);

  const cancelExport = useCallback(() => {
    if (workerRef.current && exportState === "processing") {
      workerRef.current.postMessage({ type: "CANCEL" } as WorkerMessage);
    }
  }, [exportState]);

  const resetState = useCallback(() => {
    setExportState("idle");
    setProgress(0);
    setErrorMsg(null);
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      setOutputUrl(null);
    }
  }, [outputUrl]);

  return {
    exportState,
    progress,
    outputUrl,
    errorMsg,
    initWorker,
    processVideo,
    cancelExport,
    resetState,
    cleanupWorker
  };
}

import { useState, useRef, useCallback } from "react";
import { WorkerMessage, WorkerResponse, CropData } from "@freeclip/shared";

export type ExportState = "idle" | "loading" | "ready" | "processing" | "complete" | "error" | "cancelled";

export function useFFmpeg() {
  const workerRef = useRef<Worker | null>(null);
  
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initWorker = useCallback(() => {
    if (workerRef.current) return;
    setExportState("loading");
    
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
          setErrorMsg(res.message);
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
  }, []);

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

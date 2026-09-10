import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { WorkerMessage, WorkerResponse } from "@freeclip/shared";
import { buildFFmpegCommand } from "@freeclip/shared";

const ffmpeg = new FFmpeg();

ffmpeg.on("progress", ({ progress }) => {
  postMessage({ type: "PROGRESS", progress } as WorkerResponse);
});

// Use a fast CDN for the wasm and core files
const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case "INIT":
        if (!ffmpeg.loaded) {
          const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript");
          const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm");
          
          await ffmpeg.load({
            coreURL,
            wasmURL,
          });
        }
        postMessage({ type: "READY" } as WorkerResponse);
        break;

      case "PROCESS":
        if (!ffmpeg.loaded) {
          throw new Error("FFmpeg not loaded. Send INIT first.");
        }
        
        const { fileData, fileName, startTime, endTime, crop, totalDuration } = msg;
        
        // Write file to FFmpeg virtual FS
        await ffmpeg.writeFile(fileName, new Uint8Array(fileData));
        
        const outputName = "output.mp4";
        const args = buildFFmpegCommand({
          inputFilename: fileName,
          outputFilename: outputName,
          startTime,
          endTime,
          crop,
          totalDuration,
        });

        // Run FFmpeg
        await ffmpeg.exec(args);
        
        // Read output
        const data = await ffmpeg.readFile(outputName);
        
        // Cleanup FFmpeg virtual FS to avoid memory leaks
        await ffmpeg.deleteFile(fileName);
        await ffmpeg.deleteFile(outputName);

        // Send back ArrayBuffer
        const buffer = (data as Uint8Array).buffer;
        (postMessage as (message: any, transfer?: Transferable[]) => void)({ type: "COMPLETE", data: buffer } as WorkerResponse, [buffer]);
        break;

      case "CANCEL":
        if (ffmpeg.loaded) {
          ffmpeg.terminate();
        }
        postMessage({ type: "CANCELLED" } as WorkerResponse);
        break;
    }
  } catch (error: any) {
    console.error("Worker Error:", error);
    postMessage({ type: "ERROR", message: error.message || "Unknown error occurred during processing." } as WorkerResponse);
  }
};

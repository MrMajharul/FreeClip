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
    }
  | { type: "CANCEL" };

export type WorkerResponse =
  | { type: "READY" }
  | { type: "PROGRESS"; progress: number }
  | { type: "COMPLETE"; data: ArrayBuffer }
  | { type: "ERROR"; message: string }
  | { type: "CANCELLED" };

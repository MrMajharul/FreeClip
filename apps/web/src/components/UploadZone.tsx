"use client";

import React, { useCallback, useState } from "react";
import { UploadCloud, FileWarning } from "lucide-react";
import type { VideoMetadata } from "@freeclip/shared";

interface UploadZoneProps {
  onUpload: (file: File, objectUrl: string, metadata: VideoMetadata) => void;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validateAndProcess = (file: File) => {
    setError(null);
    setIsLoading(true);

    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
    if (!isVideo) {
      setError("This video format is not supported by your browser.");
      setIsLoading(false);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const videoElement = document.createElement("video");
    videoElement.preload = "metadata";

    videoElement.addEventListener("loadedmetadata", () => {
      const duration = videoElement.duration;
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;

      if (!duration || isNaN(duration) || duration <= 0) {
        setError("FreeClip could not preview this video. Try another supported video format.");
        URL.revokeObjectURL(objectUrl);
        setIsLoading(false);
        return;
      }

      const metadata: VideoMetadata = {
        name: file.name,
        size: file.size,
        type: file.type || "video/mp4",
        duration,
        width: width || 1920,
        height: height || 1080,
        aspectRatio: width && height ? width / height : 16 / 9,
      };

      onUpload(file, objectUrl, metadata);
      setIsLoading(false);
    });

    videoElement.addEventListener("error", () => {
      setError("This video format is not supported by your browser or cannot be decoded.");
      URL.revokeObjectURL(objectUrl);
      setIsLoading(false);
    });

    videoElement.src = objectUrl;
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcess(e.dataTransfer.files[0]);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcess(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
      <div
        className={`w-full glass rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-12 text-center
          ${isDragging ? "border-primary bg-primary/10 scale-105" : "border-border hover:border-primary/50"}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <UploadCloud className={`w-16 h-16 mb-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        <h3 className="text-2xl font-bold mb-2">Drag and drop your video</h3>
        <p className="text-muted-foreground mb-6">or click to browse from your computer</p>
        
        <label className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-8 rounded-full transition-transform hover:scale-105 shadow-[0_0_20px_rgba(139,92,246,0.3)]">
          Select Video
          <input
            type="file"
            className="hidden"
            accept="video/mp4,video/webm,video/*"
            onChange={onFileChange}
            disabled={isLoading}
          />
        </label>
        
        <div className="mt-6 text-sm text-muted-foreground space-y-1">
          <p>Supported formats: MP4, WebM and browser-supported video formats</p>
          <p className="text-xs text-muted-foreground/80">
            No artificial file-size limit • Processing depends on browser and device memory
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          data-testid="upload-error"
          className="mt-6 flex items-center gap-3 text-red-400 bg-red-400/10 border border-red-400/20 px-6 py-4 rounded-xl w-full"
        >
          <FileWarning className="w-5 h-5 flex-shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Cropper from "react-easy-crop";
import TimelineTrimmer from "./TimelineTrimmer";
import { Play, Pause, Scissors, Download, XCircle, Loader2 } from "lucide-react";
import { useFFmpeg } from "../hooks/useFFmpeg";
import { CropData } from "@freeclip/shared";

interface Point {
  x: number;
  y: number;
}
interface Area {
  width: number;
  height: number;
  x: number;
  y: number;
}

interface VideoEditorProps {
  file: File;
  url: string;
  duration: number;
}

export default function VideoEditor({ file, url, duration }: VideoEditorProps) {
  // Trimmer state
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(duration);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Cropper state
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropMode, setIsCropMode] = useState(false);

  // Video Ref
  const videoRef = useRef<HTMLVideoElement>(null);

  // FFmpeg Hook
  const { 
    exportState, 
    progress, 
    outputUrl, 
    errorMsg, 
    initWorker, 
    processVideo, 
    cancelExport,
    resetState,
    cleanupWorker
  } = useFFmpeg();

  // Cleanup worker on unmount
  useEffect(() => {
    return () => cleanupWorker();
  }, [cleanupWorker]);

  // Handle Export flow
  const handleExportClick = () => {
    if (exportState === "idle" || exportState === "cancelled") {
      initWorker();
    }
  };

  // Trigger process once worker is ready
  useEffect(() => {
    if (exportState === "ready") {
      let cropData: CropData | null = null;
      if (croppedAreaPixels) {
        cropData = { ...croppedAreaPixels };
      }
      processVideo(file, startTime, endTime, cropData);
    }
  }, [exportState, file, startTime, endTime, croppedAreaPixels, processVideo]);

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      
      // Enforce trimmer bounds
      if (time >= endTime) {
        videoRef.current.pause();
        setIsPlaying(false);
        videoRef.current.currentTime = startTime;
      } else if (time < startTime) {
        videoRef.current.currentTime = startTime;
      }
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTrimChange = (start: number, end: number) => {
    setStartTime(start);
    setEndTime(end);
    if (currentTime < start || currentTime > end) {
      handleSeek(start);
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-8">
      {/* Video / Cropper Area */}
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-border group">
        {isCropMode ? (
          <Cropper
            video={url}
            crop={crop}
            zoom={zoom}
            aspect={16 / 9}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            classes={{
              containerClassName: "absolute inset-0",
              mediaClassName: "object-contain"
            }}
          />
        ) : (
          <video
            ref={videoRef}
            src={url}
            className="w-full h-full object-contain"
            onClick={togglePlay}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => {
              setIsPlaying(false);
              handleSeek(startTime);
            }}
          />
        )}

        {/* Floating Controls (only visible when not cropping) */}
        {!isCropMode && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="flex items-center gap-4 pointer-events-auto">
              <button onClick={togglePlay} className="p-2 hover:bg-white/20 rounded-full transition-colors text-white">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <div className="text-white/90 text-sm font-medium tabular-nums">
                {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Editor Tools */}
      <div className="w-full max-w-4xl bg-card rounded-2xl p-6 border border-border shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Timeline & Trim</h2>
          
          <button 
            onClick={() => setIsCropMode(!isCropMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
              isCropMode 
                ? "bg-primary text-primary-foreground border-primary" 
                : "border-border hover:bg-white/5"
            }`}
          >
            <Scissors className="w-4 h-4" />
            {isCropMode ? "Save Crop" : "Crop Video"}
          </button>
        </div>

        <TimelineTrimmer 
          duration={duration}
          currentTime={currentTime}
          startTime={startTime}
          endTime={endTime}
          onChange={handleTrimChange}
          onSeek={handleSeek}
        />

        {/* Export Section */}
        <div className="mt-8 pt-6 border-t border-border flex flex-col items-center gap-4">
          
          {(exportState === "idle" || exportState === "cancelled") && (
            <button 
              onClick={handleExportClick}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-10 rounded-full transition-transform hover:scale-105 shadow-[0_0_20px_rgba(139,92,246,0.4)] flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Export Video
            </button>
          )}

          {exportState === "loading" && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Preparing video engine...</span>
            </div>
          )}

          {exportState === "processing" && (
            <div className="w-full max-w-md flex flex-col items-center gap-4">
              <div className="w-full flex justify-between text-sm font-medium">
                <span>Exporting video...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button 
                onClick={cancelExport}
                className="text-muted-foreground hover:text-white flex items-center gap-2 text-sm mt-2 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Cancel Export
              </button>
            </div>
          )}

          {exportState === "complete" && outputUrl && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-green-400 font-medium">Export Complete!</p>
              <div className="flex gap-4">
                <a 
                  href={outputUrl} 
                  download="freeclip-export.mp4"
                  className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-8 rounded-full transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                >
                  <Download className="w-5 h-5" />
                  Download Video
                </a>
                <button 
                  onClick={resetState}
                  className="px-6 py-3 rounded-full border border-border hover:bg-white/5 transition-colors"
                >
                  New Export
                </button>
              </div>
            </div>
          )}

          {exportState === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-red-400 bg-red-400/10 border border-red-400/20 px-6 py-4 rounded-xl w-full max-w-md">
                <p className="font-bold mb-1">Video processing failed.</p>
                <p className="text-sm">{errorMsg || "Please try another video."}</p>
              </div>
              <button 
                onClick={resetState}
                className="px-6 py-2 rounded-full border border-border hover:bg-white/5 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

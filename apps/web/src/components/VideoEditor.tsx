"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Cropper from "react-easy-crop";
import TimelineTrimmer from "./TimelineTrimmer";
import { Play, Pause, Scissors, Download, XCircle, Loader2, RotateCcw, FileVideo } from "lucide-react";
import { useFFmpeg } from "../hooks/useFFmpeg";
import type { CropData, VideoSource } from "@freeclip/shared";
import { perf } from "@/lib/perf";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface CropRatioOption {
  label: string;
  value: number | undefined; // undefined = free-form
}

const CROP_RATIOS: CropRatioOption[] = [
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "4:3", value: 4 / 3 },
  { label: "Freeform", value: undefined },
];

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface VideoEditorProps {
  source: VideoSource;
  onStartOver: () => void;
}

export default function VideoEditor({ source, onStartOver }: VideoEditorProps) {
  const { file, url, duration } = source;

  // Trimmer state
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(duration);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Cropper state
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPercent, setCroppedAreaPercent] = useState<Area | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isCropApplied, setIsCropApplied] = useState(false);
  const [selectedRatioIndex, setSelectedRatioIndex] = useState(0); // default 16:9

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
    cleanupWorker,
  } = useFFmpeg();

  // Cleanup worker on unmount
  useEffect(() => {
    return () => cleanupWorker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Export flow — start worker init
  const handleExportClick = () => {
    if (exportState === "idle" || exportState === "cancelled") {
      perf.mark("EXPORT_STARTED");
      initWorker();
    }
  };

  // Trigger processVideo once worker is ready
  useEffect(() => {
    if (exportState === "ready") {
      perf.mark("FFMPEG_INITIALIZED");
      let cropData: CropData | null = null;
      if (isCropApplied && croppedAreaPixels) {
        cropData = { ...croppedAreaPixels };
      }
      processVideo(file, startTime, endTime, cropData, duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportState]);

  // Record completion timing
  useEffect(() => {
    if (exportState === "complete") {
      perf.mark("PROCESSING_COMPLETED");
      perf.summary("FFmpeg Export Pipeline");
    }
  }, [exportState]);

  const onCropComplete = useCallback((percent: Area, pixels: Area) => {
    setCroppedAreaPercent(percent);
    setCroppedAreaPixels(pixels);
  }, []);

  const handleToggleCrop = () => {
    if (isCropMode) {
      // Exiting crop mode ("Save Crop")
      if (croppedAreaPixels) {
        setIsCropApplied(true);
      }
      setIsCropMode(false);
    } else {
      // Entering crop mode ("Crop Video")
      setIsCropMode(true);
    }
  };

  const handleResetCrop = () => {
    setCroppedAreaPixels(null);
    setCroppedAreaPercent(null);
    setIsCropApplied(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

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
      // Enforce trimmer bounds during playback (looping seamlessly within selection)
      if (time >= endTime) {
        videoRef.current.pause();
        setIsPlaying(false);
        videoRef.current.currentTime = startTime;
        setCurrentTime(startTime);
      } else if (time < startTime) {
        videoRef.current.currentTime = startTime;
        setCurrentTime(startTime);
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
    if (videoRef.current) {
      if (currentTime < start || currentTime > end) {
        videoRef.current.currentTime = start;
        setCurrentTime(start);
      }
    }
  };

  const isExporting = exportState === "initializing" || exportState === "processing";

  const currentRatio = CROP_RATIOS[selectedRatioIndex];

  return (
    <div className="w-full flex flex-col items-center gap-6 sm:gap-8">
      {/* Video Metadata Header Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between text-xs sm:text-sm text-muted-foreground bg-card/60 backdrop-blur-md px-4 py-2.5 rounded-xl border border-border">
        <div className="flex items-center gap-2 truncate">
          <FileVideo className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-medium text-foreground truncate max-w-[180px] sm:max-w-xs" title={source.name}>
            {source.name}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {source.size && (
            <span className="hidden sm:inline font-mono">
              {formatFileSize(source.size)}
            </span>
          )}
          {source.width && source.height && (
            <span className="bg-secondary px-2 py-0.5 rounded font-mono text-xs text-secondary-foreground">
              {source.width}×{source.height}
            </span>
          )}
          <span className="font-mono">
            {duration.toFixed(1)}s
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              source.type === "youtube"
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {source.type === "youtube" ? "YouTube" : "Local"}
          </span>
        </div>
      </div>

      {/* Video / Cropper Area */}
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-border group flex items-center justify-center">
        {isCropMode ? (
          <Cropper
            video={url}
            crop={crop}
            zoom={zoom}
            aspect={currentRatio.value}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            classes={{
              containerClassName: "absolute inset-0",
              mediaClassName: "object-contain",
            }}
          />
        ) : isCropApplied && croppedAreaPercent ? (
          /* Real-Time Non-Destructive Cropped Preview */
          <div
            className="w-full h-full relative overflow-hidden flex items-center justify-center cursor-pointer"
            onClick={togglePlay}
          >
            <div
              className="relative overflow-hidden shadow-lg transition-all"
              style={{
                width: "100%",
                height: "100%",
                maxWidth: "100%",
                maxHeight: "100%",
                aspectRatio: `${croppedAreaPercent.width} / ${croppedAreaPercent.height}`,
              }}
            >
              <video
                ref={videoRef}
                src={url}
                style={{
                  position: "absolute",
                  width: `${(100 / croppedAreaPercent.width) * 100}%`,
                  height: `${(100 / croppedAreaPercent.height) * 100}%`,
                  left: `${-croppedAreaPercent.x * (100 / croppedAreaPercent.width)}%`,
                  top: `${-croppedAreaPercent.y * (100 / croppedAreaPercent.height)}%`,
                  maxWidth: "none",
                  maxHeight: "none",
                  objectFit: "fill",
                }}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
                  setIsPlaying(false);
                  handleSeek(startTime);
                }}
              />
            </div>
          </div>
        ) : (
          /* Full uncropped preview */
          <video
            ref={videoRef}
            src={url}
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlay}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => {
              setIsPlaying(false);
              handleSeek(startTime);
            }}
          />
        )}

        {/* Floating Controls — visible on hover when not cropping */}
        {!isCropMode && (
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="flex items-center gap-3 sm:gap-4 pointer-events-auto">
              <button
                onClick={togglePlay}
                className="p-2 hover:bg-white/20 rounded-full transition-colors text-white"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              <div className="text-white/90 text-xs sm:text-sm font-medium tabular-nums">
                {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
              </div>
              {isCropApplied && (
                <span className="text-xs bg-primary/30 text-primary-foreground border border-primary/40 px-2 py-0.5 rounded-full font-medium">
                  Cropped ({currentRatio.label})
                </span>
              )}
              {source.type === "youtube" && (
                <span className="ml-auto text-xs bg-red-500/80 text-white px-2 py-0.5 rounded-full font-medium">
                  YouTube
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Editor Tools Panel */}
      <div className="w-full max-w-4xl bg-card rounded-2xl p-4 sm:p-6 border border-border shadow-xl">
        {/* Header: Timeline & Crop Controls */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold">Timeline &amp; Trim</h2>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Crop ratio picker — only visible in crop mode */}
            {isCropMode && (
              <div className="flex items-center gap-1 bg-background rounded-full border border-border p-1">
                {CROP_RATIOS.map((r, i) => (
                  <button
                    key={r.label}
                    onClick={() => setSelectedRatioIndex(i)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      selectedRatioIndex === i
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={`Crop ratio ${r.label}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* Reset Crop Button */}
            {isCropApplied && !isCropMode && (
              <button
                id="reset-crop-btn"
                onClick={handleResetCrop}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-border hover:bg-white/5 transition-colors text-xs text-muted-foreground hover:text-white disabled:opacity-50"
                title="Reset crop back to original framing"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Crop
              </button>
            )}

            <button
              id="crop-toggle-btn"
              onClick={handleToggleCrop}
              disabled={isExporting}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border transition-all text-sm ${
                isCropMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : isCropApplied
                  ? "border-primary/60 bg-primary/10 text-foreground hover:bg-primary/20"
                  : "border-border hover:bg-white/5"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Scissors className="w-4 h-4" />
              {isCropMode ? "Save Crop" : isCropApplied ? "Adjust Crop" : "Crop Video"}
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div
          className={`transition-opacity ${isExporting ? "opacity-50 pointer-events-none" : ""}`}
          aria-disabled={isExporting}
        >
          <TimelineTrimmer
            duration={duration}
            currentTime={currentTime}
            startTime={startTime}
            endTime={endTime}
            onChange={handleTrimChange}
            onSeek={handleSeek}
          />
        </div>

        {/* Export Section */}
        <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-border flex flex-col items-center gap-4">
          {(exportState === "idle" || exportState === "cancelled") && (
            <div className="flex flex-col items-center gap-2">
              {exportState === "cancelled" && (
                <p className="text-sm text-muted-foreground">Export cancelled</p>
              )}
              <button
                id="export-btn"
                onClick={handleExportClick}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-8 sm:px-10 rounded-full transition-transform hover:scale-105 shadow-[0_0_20px_rgba(139,92,246,0.4)] flex items-center gap-2 text-sm sm:text-base"
              >
                <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                {exportState === "cancelled" ? "Export Again" : "Export Video"}
              </button>
            </div>
          )}

          {exportState === "initializing" && (
            <div className="flex items-center gap-3 text-muted-foreground text-sm sm:text-base" role="status">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Preparing video engine…</span>
            </div>
          )}

          {exportState === "processing" && (
            <div className="w-full max-w-md flex flex-col items-center gap-4" role="status">
              <div className="w-full flex justify-between text-sm font-medium">
                <span>Exporting video…</span>
                <span aria-live="polite">{progress}%</span>
              </div>
              <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <button
                id="cancel-export-btn"
                onClick={cancelExport}
                className="text-muted-foreground hover:text-white flex items-center gap-2 text-sm mt-2 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Cancel Export
              </button>
            </div>
          )}

          {exportState === "complete" && outputUrl && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-green-400 font-medium flex items-center gap-2">
                <span>✓</span> Video ready
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
                <a
                  id="download-btn"
                  href={outputUrl}
                  download="freeclip-export.mp4"
                  className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 sm:px-8 rounded-full transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.3)] text-sm sm:text-base"
                >
                  <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                  Download Video
                </a>
                <button
                  id="new-export-btn"
                  onClick={resetState}
                  className="px-5 sm:px-6 py-3 rounded-full border border-border hover:bg-white/5 transition-colors text-sm sm:text-base"
                >
                  New Export
                </button>
              </div>
            </div>
          )}

          {exportState === "error" && (
            <div className="flex flex-col items-center gap-4 text-center w-full max-w-md">
              <div className="text-red-400 bg-red-400/10 border border-red-400/20 px-5 sm:px-6 py-4 rounded-xl w-full">
                <p className="font-bold mb-1">Video processing failed.</p>
                <p className="text-sm">{errorMsg ?? "Please try another video."}</p>
              </div>
              <button
                onClick={resetState}
                className="px-5 sm:px-6 py-2 rounded-full border border-border hover:bg-white/5 transition-colors text-sm"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Start Over */}
        <div className="mt-6 sm:mt-8 text-center">
          <button
            id="start-over-btn"
            disabled={isExporting}
            className="flex items-center gap-2 mx-auto px-5 sm:px-6 py-2 rounded-full border border-border hover:bg-white/5 transition-colors text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            onClick={onStartOver}
          >
            <RotateCcw className="w-4 h-4" />
            Start Over
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Cropper from "react-easy-crop";
import TimelineTrimmer from "./TimelineTrimmer";
import { Play, Pause, Scissors, Maximize } from "lucide-react";

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
  url: string;
  duration: number;
}

export default function VideoEditor({ url, duration }: VideoEditorProps) {
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

  const generateFfmpegCommand = () => {
    if (!croppedAreaPixels) return;
    const { x, y, width, height } = croppedAreaPixels;
    const cropFilter = `crop=${Math.round(width)}:${Math.round(height)}:${Math.round(x)}:${Math.round(y)}`;
    const trimFilter = `-ss ${startTime.toFixed(2)} -t ${(endTime - startTime).toFixed(2)}`;
    
    return `ffmpeg -i input.mp4 ${trimFilter} -vf "${cropFilter}" -c:v libx264 -c:a aac output.mp4`;
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
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="flex items-center gap-4">
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

        {/* Debug View for Sprint 1 */}
        <div className="mt-8 p-4 bg-black/30 rounded-xl font-mono text-sm text-muted-foreground break-all">
          <div className="text-white mb-2 font-semibold">Generated FFmpeg Command (Preview)</div>
          <div className="text-primary">{generateFfmpegCommand()}</div>
        </div>
      </div>
    </div>
  );
}

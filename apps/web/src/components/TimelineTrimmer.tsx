"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

interface TimelineTrimmerProps {
  duration: number;
  currentTime: number;
  startTime: number;
  endTime: number;
  onChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
}

export default function TimelineTrimmer({
  duration,
  currentTime,
  startTime,
  endTime,
  onChange,
  onSeek
}: TimelineTrimmerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<"start" | "end" | "scrubber" | null>(null);

  const getPercentage = useCallback((time: number) => {
    if (duration === 0) return 0;
    return (time / duration) * 100;
  }, [duration]);

  const getTimeFromEvent = useCallback((e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent) => {
    if (!trackRef.current) return 0;
    
    const rect = trackRef.current.getBoundingClientRect();
    let clientX = 0;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = (e as MouseEvent).clientX;
    }
    
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    return percentage * duration;
  }, [duration]);

  const handlePointerDown = (type: "start" | "end" | "scrubber", e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(type);
  };

  const handleTrackClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    const time = getTimeFromEvent(e);
    onSeek(Math.max(startTime, Math.min(time, endTime)));
  };

  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      
      const newTime = getTimeFromEvent(e);
      
      if (isDragging === "start") {
        onChange(Math.min(newTime, endTime - 0.5), endTime); // min 0.5s gap
      } else if (isDragging === "end") {
        onChange(startTime, Math.max(newTime, startTime + 0.5));
      } else if (isDragging === "scrubber") {
        // Scrubber can't go outside trim boundaries
        onSeek(Math.max(startTime, Math.min(newTime, endTime)));
      }
    };

    const handlePointerUp = () => {
      setIsDragging(null);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handlePointerMove);
      window.addEventListener("mouseup", handlePointerUp);
      window.addEventListener("touchmove", handlePointerMove, { passive: false });
      window.addEventListener("touchend", handlePointerUp);
    }

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [isDragging, startTime, endTime, duration, onChange, onSeek, getTimeFromEvent]);

  return (
    <div className="w-full py-6 select-none relative group">
      <div 
        ref={trackRef}
        className="relative h-12 bg-card rounded-lg overflow-hidden border border-border cursor-pointer"
        onClick={handleTrackClick}
      >
        {/* Unselected regions (dimmed) */}
        <div className="absolute top-0 bottom-0 left-0 bg-black/50" style={{ width: `${getPercentage(startTime)}%` }} />
        <div className="absolute top-0 bottom-0 right-0 bg-black/50" style={{ width: `${100 - getPercentage(endTime)}%` }} />
        
        {/* Selected region (highlighted border) */}
        <div 
          className="absolute top-0 bottom-0 border-y-4 border-primary/80 bg-primary/20 pointer-events-none transition-colors"
          style={{ 
            left: `${getPercentage(startTime)}%`, 
            width: `${getPercentage(endTime) - getPercentage(startTime)}%` 
          }}
        />

        {/* Start Handle */}
        <div 
          className="absolute top-0 bottom-0 w-4 bg-primary cursor-ew-resize hover:bg-primary/90 flex items-center justify-center -ml-2 rounded-l-md shadow-lg z-10"
          style={{ left: `${getPercentage(startTime)}%` }}
          onMouseDown={(e) => handlePointerDown("start", e)}
          onTouchStart={(e) => handlePointerDown("start", e)}
        >
          <div className="w-1 h-4 bg-white/50 rounded-full" />
        </div>

        {/* End Handle */}
        <div 
          className="absolute top-0 bottom-0 w-4 bg-primary cursor-ew-resize hover:bg-primary/90 flex items-center justify-center -mr-2 rounded-r-md shadow-lg z-10"
          style={{ left: `${getPercentage(endTime)}%` }}
          onMouseDown={(e) => handlePointerDown("end", e)}
          onTouchStart={(e) => handlePointerDown("end", e)}
        >
          <div className="w-1 h-4 bg-white/50 rounded-full" />
        </div>

        {/* Playhead / Scrubber */}
        <div 
          className="absolute top-0 h-full w-[2px] bg-white cursor-ew-resize z-20 shadow-[0_0_10px_rgba(255,255,255,0.8)]"
          style={{ left: `${getPercentage(currentTime)}%` }}
          onMouseDown={(e) => handlePointerDown("scrubber", e)}
          onTouchStart={(e) => handlePointerDown("scrubber", e)}
        >
          <div className="absolute -top-3 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg" />
        </div>
      </div>
      
      {/* Time indicators */}
      <div className="flex justify-between mt-2 text-xs font-mono text-muted-foreground">
        <span>{startTime.toFixed(2)}s</span>
        <span className="text-white/80 font-bold bg-card px-2 py-0.5 rounded">
          Trimmed: {(endTime - startTime).toFixed(2)}s
        </span>
        <span>{endTime.toFixed(2)}s</span>
      </div>
    </div>
  );
}

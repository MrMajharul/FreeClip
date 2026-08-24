"use client";

import { useState } from "react";
import UploadZone from "@/components/UploadZone";
import VideoEditor from "@/components/VideoEditor";

export default function Home() {
  const [videoData, setVideoData] = useState<{ file: File; url: string; duration: number } | null>(null);

  const handleUpload = (file: File, url: string, duration: number) => {
    setVideoData({ file, url, duration });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 lg:p-24 bg-background relative overflow-hidden">
      {/* Dynamic background effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[128px] pointer-events-none" />

      <div className="z-10 w-full max-w-5xl flex flex-col items-center text-center">
        {!videoData ? (
          <>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
              FreeClip
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12">
              The fastest way to crop and trim your videos directly in the browser. Zero server uploads, absolute privacy.
            </p>
            <UploadZone onUpload={handleUpload} />
          </>
        ) : (
          <div className="w-full flex flex-col items-center">
            <h1 className="text-3xl font-bold mb-8 text-left bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent self-start">
              Edit Video
            </h1>
            
            <VideoEditor 
              file={videoData.file} 
              url={videoData.url} 
              duration={videoData.duration} 
              onStartOver={() => {
                URL.revokeObjectURL(videoData.url);
                setVideoData(null);
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}

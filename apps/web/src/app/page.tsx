"use client";

import { useState } from "react";
import { Link, Loader2, AlertCircle } from "lucide-react";
import UploadZone from "@/components/UploadZone";
import VideoEditor from "@/components/VideoEditor";

export default function Home() {
  const [videoData, setVideoData] = useState<{ file: File; url: string; duration: number } | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleUpload = (file: File, url: string, duration: number) => {
    setVideoData({ file, url, duration });
  };

  const handleFetchYoutube = async () => {
    if (!ytUrl) return;
    setIsFetching(true);
    setFetchError(null);

    try {
      // Assuming API runs on port 4000
      const apiUrl = `http://localhost:4000/api/extract?url=${encodeURIComponent(ytUrl)}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${response.status}`);
      }

      const blob = await response.blob();
      
      // Need a synthetic File object for the VideoEditor to work seamlessly
      const file = new File([blob], "youtube-video.mp4", { type: "video/mp4" });
      const url = URL.createObjectURL(file);
      
      // Extract duration by creating a temporary video element
      const tempVideo = document.createElement("video");
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        handleUpload(file, url, tempVideo.duration);
      };
    } catch (err: any) {
      setFetchError(err.message || "Failed to load video");
      console.error(err);
    } finally {
      setIsFetching(false);
    }
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
            
            <div className="w-full max-w-2xl flex flex-col gap-8">
              {/* URL Input */}
              <div className="w-full bg-card rounded-2xl border border-border p-6 shadow-xl flex flex-col items-center">
                <h3 className="text-xl font-bold mb-4">Import from YouTube</h3>
                <div className="flex w-full gap-2 relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Link className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1 bg-background border border-border rounded-full pl-12 pr-4 py-3 outline-none focus:border-primary transition-colors disabled:opacity-50"
                    disabled={isFetching}
                  />
                  <button
                    onClick={handleFetchYoutube}
                    disabled={isFetching || !ytUrl.trim()}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 rounded-full transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center min-w-[120px]"
                  >
                    {isFetching ? <Loader2 className="w-5 h-5 animate-spin" /> : "Load Video"}
                  </button>
                </div>
                {fetchError && (
                  <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{fetchError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 text-muted-foreground">
                <div className="flex-1 h-px bg-border" />
                <span className="font-medium">OR</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Upload Zone */}
              <UploadZone onUpload={handleUpload} />
            </div>
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

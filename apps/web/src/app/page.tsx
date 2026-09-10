"use client";

import { useState } from "react";
import { Link, Loader2, AlertCircle, CheckCircle2, Clock, FileVideo } from "lucide-react";
import Logo from "@/components/Logo";
import UploadZone from "@/components/UploadZone";
import VideoEditor from "@/components/VideoEditor";
import { useYouTubeImport } from "@/hooks/useYouTubeImport";
import type { VideoMetadata, VideoSource } from "@freeclip/shared";
import { perf } from "@/lib/perf";

// ─── Phase label helpers ──────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  VALIDATING: "Validating URL…",
  FETCHING_METADATA: "Fetching video information…",
  PREPARING_VIDEO: "Preparing video…",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const { importState, startImport, confirmImport, reset: resetImport } = useYouTubeImport();

  // Local upload handler — converts to VideoSource with rich metadata
  const handleUpload = (file: File, url: string, metadata: VideoMetadata) => {
    perf.reset();
    perf.mark("LOCAL_UPLOAD_ACCEPTED");
    const source: VideoSource = {
      type: "local",
      file,
      url,
      name: metadata.name,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      size: metadata.size,
      metadata,
    };
    setVideoSource(source);
    perf.mark("EDITOR_READY");
    perf.summary("Local Upload Pipeline");
  };

  // Start over — cleanup and return to landing
  const handleStartOver = () => {
    if (videoSource) {
      URL.revokeObjectURL(videoSource.url);
    }
    setVideoSource(null);
    setYtUrl("");
    resetImport();
  };

  // Phase 1: User submits URL → validate + fetch metadata
  const handleFetchYoutube = async () => {
    if (!ytUrl.trim()) return;
    await startImport(ytUrl);
  };

  // Phase 2: User confirms metadata preview → download + open editor
  const handleStartEditing = async () => {
    const source = await confirmImport(ytUrl);
    if (source) {
      setVideoSource(source);
    }
  };

  const isLoading =
    importState.phase === "VALIDATING" ||
    importState.phase === "FETCHING_METADATA" ||
    importState.phase === "PREPARING_VIDEO";

  const hasMetadata =
    (importState.phase === "FETCHING_METADATA" || importState.phase === "PREPARING_VIDEO") &&
    importState.metadata != null;

  const hasError = importState.phase === "ERROR";

  // ── Editor View ─────────────────────────────────────────────────────────────
  if (videoSource) {
    return (
      <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 lg:p-16 bg-background relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[128px] pointer-events-none" />

        <div className="z-10 w-full max-w-5xl flex flex-col items-start">
          <div className="w-full flex items-center justify-between mb-6 sm:mb-8">
            <button
              onClick={handleStartOver}
              className="hover:opacity-85 transition-opacity focus:outline-none"
              title="Return to FreeClip Home"
            >
              <Logo size="sm" />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
              Edit Video
            </h1>
          </div>

          <VideoEditor source={videoSource} onStartOver={handleStartOver} />
        </div>
      </main>
    );
  }

  // ── Landing / Import View ────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 lg:p-24 bg-background relative overflow-hidden">
      {/* Dynamic background effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[128px] pointer-events-none" />

      <div className="z-10 w-full max-w-5xl flex flex-col items-center text-center">
        <h1 className="mb-4 sm:mb-6">
          <Logo size="xl" />
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mb-8 sm:mb-12">
          Crop and trim videos directly in your browser. Zero server uploads, absolute privacy.
        </p>

        <div className="w-full max-w-2xl flex flex-col gap-6 sm:gap-8">
          {/* YouTube URL Import Card */}
          <div className="w-full bg-card rounded-2xl border border-border p-4 sm:p-6 shadow-xl flex flex-col items-center">
            <h2 className="text-lg sm:text-xl font-bold mb-4">Import from YouTube</h2>

            {/* URL Input Row */}
            <div className="flex w-full gap-2 relative">
              <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Link className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <input
                id="youtube-url-input"
                type="url"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isLoading && handleFetchYoutube()}
                placeholder="https://youtube.com/watch?v=..."
                className="flex-1 bg-background border border-border rounded-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 text-sm sm:text-base outline-none focus:border-primary transition-colors disabled:opacity-50"
                disabled={isLoading}
                aria-label="YouTube video URL"
              />
              <button
                id="youtube-load-btn"
                onClick={handleFetchYoutube}
                disabled={isLoading || !ytUrl.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 sm:px-6 py-2.5 sm:py-3 rounded-full transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center min-w-[90px] sm:min-w-[120px] text-sm sm:text-base"
                aria-busy={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : "Load Video"}
              </button>
            </div>

            {/* Loading Phase Indicator */}
            {isLoading && (
              <div className="mt-4 flex items-center gap-2 text-muted-foreground text-sm" role="status" aria-live="polite">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>{PHASE_LABELS[importState.phase] ?? "Loading…"}</span>
              </div>
            )}

            {/* Error Display */}
            {hasError && (
              <div
                id="youtube-error-alert"
                data-testid="youtube-error"
                className="mt-4 flex items-start gap-2 text-red-400 text-sm w-full"
                role="alert"
                aria-live="assertive"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{importState.errorMessage ?? "An error occurred."}</span>
              </div>
            )}

            {/* Metadata Preview Card */}
            {hasMetadata && importState.metadata && (
              <div className="mt-5 sm:mt-6 w-full flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-black/40 rounded-xl border border-white/10 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={importState.metadata.thumbnail}
                  alt={importState.metadata.title}
                  className="w-full sm:w-32 h-auto max-h-24 rounded-lg object-cover shadow-lg flex-shrink-0"
                />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <h3 className="font-bold line-clamp-2 text-sm sm:text-base">{importState.metadata.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(importState.metadata.duration)}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">Meets size &amp; duration limits</span>
                  </p>

                  <button
                    id="youtube-start-editing-btn"
                    onClick={handleStartEditing}
                    disabled={importState.phase === "PREPARING_VIDEO"}
                    className="mt-2 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-4 py-2 rounded-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm self-start w-full sm:w-auto"
                    aria-busy={importState.phase === "PREPARING_VIDEO"}
                  >
                    {importState.phase === "PREPARING_VIDEO" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Preparing video…</span>
                      </>
                    ) : (
                      <>
                        <FileVideo className="w-4 h-4" />
                        <span>Start Editing</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            <span className="font-medium text-sm">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Local Upload Zone */}
          <UploadZone onUpload={handleUpload} />
        </div>
      </div>
    </main>
  );
}

import React from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { icon: 28, text: "text-lg", gap: "gap-2" },
  md: { icon: 40, text: "text-2xl", gap: "gap-3" },
  lg: { icon: 56, text: "text-4xl", gap: "gap-4" },
  xl: { icon: 72, text: "text-5xl sm:text-6xl md:text-7xl", gap: "gap-5" },
};

export default function Logo({
  size = "md",
  showWordmark = true,
  className = "",
}: LogoProps) {
  const { icon, text, gap } = SIZE_MAP[size];

  return (
    <div
      className={`inline-flex items-center ${gap} select-none group ${className}`}
      aria-label="FreeClip Logo"
    >
      {/* ─── Vector Emblem ─── */}
      <div
        className="relative flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
        style={{ width: icon, height: icon }}
      >
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-violet-600/40 via-blue-500/30 to-cyan-400/40 rounded-2xl blur-md opacity-75 group-hover:opacity-100 transition-opacity duration-300" />

        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-[0_4px_12px_rgba(139,92,246,0.35)]"
        >
          <defs>
            {/* Primary Gradient (Violet to Cyan) */}
            <linearGradient id="fc-grad-primary" x1="6" y1="8" x2="58" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="45%" stopColor="#6366f1" />
              <stop offset="75%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            {/* Accent Cutter Gradient */}
            <linearGradient id="fc-grad-cutter" x1="28" y1="6" x2="58" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>

            {/* Badge Background Gradient */}
            <linearGradient id="fc-bg-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#18181b" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#09090b" stopOpacity="0.98" />
            </linearGradient>

            {/* Subtle Border Gradient */}
            <linearGradient id="fc-border-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {/* Squircle App Frame */}
          <rect
            x="3"
            y="3"
            width="58"
            height="58"
            rx="16"
            fill="url(#fc-bg-grad)"
            stroke="url(#fc-border-grad)"
            strokeWidth="1.5"
          />

          {/* Film Strip Micro-Perforations */}
          <rect x="42" y="9" width="3.5" height="3.5" rx="1" fill="#38bdf8" fillOpacity="0.8" />
          <rect x="48" y="13" width="3.5" height="3.5" rx="1" fill="#38bdf8" fillOpacity="0.5" />

          {/* Primary Forward Play Triangle / Film Blade */}
          {/* Upper facet with scissor razor cut */}
          <path
            d="M 21 16 
               C 21 14.2 23 13.1 24.5 14 
               L 45.5 26.2 
               C 47.2 27.2 47.2 29.8 45.5 30.8 
               L 33 38 
               L 27 34.5 
               L 36 29 
               L 23 21.5 
               L 23 45 
               C 23 46.8 21 47.8 19.5 46.8 
               C 19 46.4 18.5 45.5 18.5 44 
               L 18.5 18.5 
               C 18.5 17.1 19.6 16 21 16 
               Z"
            fill="url(#fc-grad-primary)"
          />

          {/* Lower Play & Crop Blade Anchor */}
          <path
            d="M 26 37 
               L 45.2 32.8 
               C 46.8 32.4 48.2 34 47.6 35.5 
               L 43.5 44 
               C 42.8 45.4 41.2 46.2 39.7 45.8 
               L 24.5 41.5 
               Z"
            fill="url(#fc-grad-cutter)"
          />

          {/* Center Precision Crop Indicator Point */}
          <circle cx="31.5" cy="28.5" r="2" fill="#38bdf8" />
        </svg>
      </div>

      {/* ─── Typography Wordmark ─── */}
      {showWordmark && (
        <div className={`font-extrabold tracking-tight ${text} flex items-center leading-none`}>
          <span className="text-white drop-shadow-sm">Free</span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400">
            Clip
          </span>
        </div>
      )}
    </div>
  );
}

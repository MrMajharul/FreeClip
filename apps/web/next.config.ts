import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@freeclip/shared"],
  // Allow fetching WASM from external domains if we run into strict CSP issues
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Custom plugin to inject the required SharedArrayBuffer headers
    {
      name: 'add-coop-coep-headers',
      // Applies to the development server (npm run dev)
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          next();
        });
      },
      // Applies to the production preview server (npm run preview)
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          next();
        });
      }
    }
  ],
  optimizeDeps: [
    // Prevents Vite from pre-bundling FFmpeg, which breaks it
    '@ffmpeg/ffmpeg',
    '@ffmpeg/util'
  ]
})
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// FFmpeg.wasm (multi-threaded build) requires SharedArrayBuffer, which the
// browser only exposes under "cross-origin isolation". These headers turn it on
// for the dev server. Configure the same headers on your production host.
const crossOriginIsolation = {
  name: 'cross-origin-isolation',
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), crossOriginIsolation],
  // @ffmpeg/* ship their own workers; don't let Vite try to pre-bundle them.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    port: 5173,
  },
});

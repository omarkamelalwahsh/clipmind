import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: We use the SINGLE-THREADED @ffmpeg/core (not core-mt), which does NOT
// need SharedArrayBuffer / cross-origin isolation. Setting COEP=require-corp is
// unnecessary here and was preventing the FFmpeg worker from initializing, so we
// deliberately do NOT set COOP/COEP. (Only add them back if you switch to the
// multi-threaded core.)

export default defineConfig({
  plugins: [react()],
  // @ffmpeg/* ship their own workers; don't let Vite try to pre-bundle them.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    port: 5173,
  },
});

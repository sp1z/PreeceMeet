import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Output is consumed by Electron at runtime (electron/main.cjs loads dist/index.html).
// `base: './'` makes asset URLs relative so file:// loading works from the packaged asar.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir:       'dist',
    emptyOutDir:  true,
    sourcemap:    false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});

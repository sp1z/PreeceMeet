import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vite serves on 1420 by default for Tauri dev
  server: { port: 1420, strictPort: true },
  // Tauri expects a relative base path
  base: './',
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite is configured with the frontend folder as root.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // backend dev server; set PORT=5000 when running dev:server
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});

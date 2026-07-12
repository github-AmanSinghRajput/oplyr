import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  // Relative asset paths so the built app loads under file:// in the packaged Electron shell.
  // Absolute "/assets/…" paths resolve to the disk root there → blank window. Dev server + the
  // browser preview both work fine with a relative base too.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173
  }
});

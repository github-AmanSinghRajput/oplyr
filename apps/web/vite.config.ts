import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createRequire } from 'node:module';

// Build-time app version, read from this package.json. Used as the browser-dev fallback for the
// version shown in Settings (the packaged app prefers Electron's authoritative app.getVersion()).
const pkg = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig({
  // Relative asset paths so the built app loads under file:// in the packaged Electron shell.
  // Absolute "/assets/…" paths resolve to the disk root there → blank window. Dev server + the
  // browser preview both work fine with a relative base too.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
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

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// https://vitejs.dev/config
export default defineConfig({
  root: './src/renderer',
  // Pin the dev server to IPv4 on a dedicated port. Default Vite would try
  // localhost:5173, but on cad-doctor the program-board service already holds
  // 127.0.0.1:5173, so Vite would silently fall back to IPv6 ::1:5173 while
  // Electron's `http://localhost:5173` resolves to IPv4 first and loads
  // program-board's page instead of this renderer. A distinct IPv4 port avoids
  // the collision entirely.
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: false,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve('src/renderer'),
      '@shared': path.resolve('src/shared'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});

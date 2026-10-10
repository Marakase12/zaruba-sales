import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./frontend', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../outputs/shared-host/frontend', import.meta.url)),
    emptyOutDir: true,
  },
});

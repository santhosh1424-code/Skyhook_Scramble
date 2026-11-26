import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  publicDir: path.resolve(__dirname, 'assets'),
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@client': path.resolve(__dirname, 'client/src')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});

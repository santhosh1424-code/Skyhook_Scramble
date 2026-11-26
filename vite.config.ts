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
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          three_addons: [
            'three/examples/jsm/loaders/GLTFLoader.js',
            'three/examples/jsm/loaders/DRACOLoader.js',
            'three/examples/jsm/loaders/KTX2Loader.js',
            'three/examples/jsm/utils/SkeletonUtils.js'
          ],
          postfx: [
            'three/examples/jsm/postprocessing/EffectComposer.js',
            'three/examples/jsm/postprocessing/RenderPass.js',
            'three/examples/jsm/postprocessing/UnrealBloomPass.js',
            'three/examples/jsm/postprocessing/SMAAPass.js',
            'three/examples/jsm/postprocessing/SSAOPass.js',
            'three/examples/jsm/postprocessing/ShaderPass.js'
          ]
        }
      }
    }
  },
  server: {
    port: 5173
  }
});

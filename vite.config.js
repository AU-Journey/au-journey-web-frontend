// vite.config.ts
import { defineConfig, splitVendorChunkPlugin } from 'vite';
import { resolve } from 'path';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(({ command, mode }) => {
  const deployTarget = process.env.DEPLOY_TARGET || 'digitalocean';

  // ✅ Serve under /journey/ for DO and Docker in prod; '/' otherwise
  const base =
    mode === 'production'
      ? (['docker', 'digitalocean'].includes(deployTarget) ? '/journey/' : '/')
      : '/';

  console.log(`Building with base path: ${base} (mode: ${mode}, target: ${deployTarget})`);

  return {
    base,
    plugins: [
      splitVendorChunkPlugin(),
      viteCompression({
        verbose: false,
        algorithm: 'brotliCompress',
        ext: '.br',
        compressionOptions: { level: 11 },
        threshold: 1024,
        deleteOriginFile: false,
        filter: (file) => !file.endsWith('.map'),
      }),
      viteCompression({
        verbose: false,
        algorithm: 'gzip',
        ext: '.gz',
        compressionOptions: { level: 9 },
        threshold: 1024,
        deleteOriginFile: false,
        filter: (file) => !file.endsWith('.map'),
      }),
    ],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      target: ['es2020', 'safari13'],
      cssTarget: 'es2020',
      sourcemap: mode === 'production' ? 'hidden' : true,
      reportCompressedSize: true,
      minify: 'terser',
      terserOptions: {
        compress: { drop_console: true, drop_debugger: true, passes: 2 },
        mangle: true,
        format: { comments: false },
      },
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: { main: resolve(__dirname, 'index.html') },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three/examples')) return 'three-examples';
            if (id.includes('node_modules/three')) return 'three-core';
            if (id.includes('node_modules')) return 'vendor';
          },
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: ({ name }) => {
            const ext = name ? name.split('.').pop() : 'asset';
            return `assets/${ext}/[name]-[hash].[ext]`;
          },
        },
      },
      emptyOutDir: true,
      modulePreload: { polyfill: false },
    },
    publicDir: 'public',
    server: {
      port: 5173,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    },
    preview: { port: 4173 },
    define: { __MODEL_CACHE_BUST__: JSON.stringify(Date.now()) },
    optimizeDeps: {
      include: [
        'three',
        'three/examples/jsm/loaders/GLTFLoader',
        'three/examples/jsm/loaders/FBXLoader',
        'three/examples/jsm/controls/OrbitControls',
        'socket.io-client',
      ],
    },
  };
});

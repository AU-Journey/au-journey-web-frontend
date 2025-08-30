import { defineConfig, splitVendorChunkPlugin } from 'vite';
import { resolve } from 'path';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(({ command, mode }) => {
  const deployTarget = process.env.DEPLOY_TARGET || 'digitalocean';

  // Base path per target (unchanged from your intent)
  const base =
    mode === 'production'
      ? deployTarget === 'docker'
        ? '/journey/'
        : '/'
      : '/';

  console.log(`Building with base path: ${base} (mode: ${mode})`);

  return {
    base,
    plugins: [
      splitVendorChunkPlugin(),

      // 🔥 Precompress artifacts for CDNs / Nginx to serve directly
      viteCompression({
        verbose: false,
        algorithm: 'brotliCompress',
        ext: '.br',
        compressionOptions: { level: 11 },
        threshold: 1024, // only files >1KB
        deleteOriginFile: false,
        filter: (file) =>
          // skip source maps
          !file.endsWith('.map'),
      }),
      // Also emit gzip for older proxies
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
      target: ['es2020', 'safari13'], // ✅ sensible modern mobile/desktop baseline
      cssTarget: 'es2020',
      sourcemap: mode === 'production' ? 'hidden' : true, // hidden maps in prod
      reportCompressedSize: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
        },
        mangle: true,
        format: { comments: false },
      },
      // Keep warnings realistic for big 3D bundles
      chunkSizeWarningLimit: 1200,

      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
        output: {
          // 🎯 Chunking tuned for caching and faster mobile boot
          manualChunks(id) {
            if (id.includes('node_modules/three/examples')) return 'three-examples';
            if (id.includes('node_modules/three')) return 'three-core';
            if (id.includes('node_modules')) return 'vendor';
          },
          // stable hashed filenames
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: ({ name }) => {
            const ext = name ? name.split('.').pop() : 'asset';
            return `assets/${ext}/[name]-[hash].[ext]`;
          },
        },
      },

      // cleaner output on every build
      emptyOutDir: true,

      // esbuild options for pre-bundling (keeps optional chaining etc.)
      modulePreload: { polyfill: false },
    },

    publicDir: 'public',

    server: {
      port: 5173,
      // Disable caching for models during dev
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    },

    preview: {
      port: 4173,
      // Note: preview doesn't auto-serve .br/.gz; your prod server should.
    },

    define: {
      __MODEL_CACHE_BUST__: JSON.stringify(Date.now()),
    },

    // Make pre-bundling fast & correct for our deps
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

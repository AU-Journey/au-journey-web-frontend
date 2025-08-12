import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ command, mode }) => {
  // For DigitalOcean static site deployment, use root path
  // This works for both local development and production
  const base = '/'
  
  console.log(`Building with base path: ${base} (mode: ${mode})`)
  
  return {
    base,
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
        output: {
          // Ensure proper chunking and asset handling
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
        }
      },
      // Ensure source maps in production for debugging
      sourcemap: true,
      // Ensure clean builds
      emptyOutDir: true
    },
    publicDir: 'public',
    server: {
      port: 5173,
      // Disable caching for model files during development
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    },
    preview: {
      port: 4173,
    },
    // Prevent aggressive caching of model files
    define: {
      // Add timestamp for cache busting in development
      __MODEL_CACHE_BUST__: JSON.stringify(Date.now())
    }
  }
}) 
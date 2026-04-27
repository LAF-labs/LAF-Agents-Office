/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7891',
        changeOrigin: true,
      },
      '/api-token': {
        target: 'http://127.0.0.1:7891',
        changeOrigin: true,
      },
      '/onboarding': {
        target: 'http://127.0.0.1:7891',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 20_000,
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules\/(react|react-dom|scheduler)\//,
            },
            {
              name: 'query-vendor',
              test: /node_modules\/@tanstack\//,
            },
            {
              name: 'markdown-vendor',
              test:
                /node_modules\/(react-markdown|remark-|rehype-|unified|micromark|mdast-|hast-|vfile|github-slugger)\//,
            },
            {
              name: 'vendor',
              test: /node_modules\//,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/components/wiki/**', 'src/lib/wikilink.ts', 'src/api/wiki.ts'],
      thresholds: { lines: 80, branches: 80, functions: 80 },
    },
  },
})

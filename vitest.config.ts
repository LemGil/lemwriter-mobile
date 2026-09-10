import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/vitest.setup.ts'],
    include: [
      'src/lib/__tests__/**/*.test.ts',
      'src/__integration__/**/*.test.tsx'
    ],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/lib/offlineStore.ts',
        'src/lib/indexedDbStore.ts',
        'src/hooks/useOnlineStatus.ts',
        'src/hooks/useDictado.ts'
      ],
      exclude: [
        'node_modules/',
        'test/',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'e2e/',
        '*.config.*'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/utils': path.resolve(__dirname, './src/utils')
    },
    deps: {
      inline: ['@tiptap/*', 'prosemirror-*']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
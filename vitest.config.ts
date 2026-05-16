import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000, // 30s for integration tests with LocalStack
    hookTimeout: 30000,
    teardownTimeout: 30000,
    include: ['**/src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/node_modules/**'],
    silent: false,
    reporters: ['verbose']
  },
  resolve: {
    alias: {
      // Package aliases for clean imports across the monorepo
      '@platform/configuration': resolve(__dirname, './packages/configuration/src'),
      '@platform/core': resolve(__dirname, './packages/core/src'),
      // Add more packages as they're created
    }
  }
})

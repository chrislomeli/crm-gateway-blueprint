import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 10000,
    clearMocks: true,
    restoreMocks: true,
    include: ['src/tests/**/*.{test,spec}.{js,ts}']
  },
  resolve: {
    alias: {
      '@': './src',
      '@tests': './src/tests',
      '@mocks': './src/tests/__mocks__'
    }
  }
})

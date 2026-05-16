import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@platform/core': resolve(__dirname, '../../packages/core/src'),
      '@platform/configuration': resolve(__dirname, '../../packages/configuration/src'),
      '@platform/connectors': resolve(__dirname, '../../packages/connectors/src'),
      '@platform/framework': resolve(__dirname, '../../packages/framework/src'),
      '@platform/services': resolve(__dirname, '../../packages/services/src'),
    },
  },
});

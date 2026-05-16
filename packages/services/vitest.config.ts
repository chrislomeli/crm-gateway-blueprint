// publishing/webhook-subscriber/vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from '../../vitest.config.base'

export default mergeConfig(
    baseConfig,
    defineConfig({
        test: {
            setupFiles: ['./src/test/setup.ts'],  // If you have setup
            // Service-specific config
        }
    })
)
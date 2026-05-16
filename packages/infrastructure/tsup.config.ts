import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/**/*.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: true,
    splitting: false,
    target: 'node18',
});

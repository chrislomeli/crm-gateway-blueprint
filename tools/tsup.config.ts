import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'infrastructure/**/*.ts',
    'scripts/**/*.ts',
    'testing/**/*.ts',
    'runbooks/**/*.ts'
  ],
  format: ['esm'],
  target: 'node18',
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  outDir: 'dist',
  external: [
    // External dependencies that should not be bundled
    'mysql2',
    'tsx'
  ]
});

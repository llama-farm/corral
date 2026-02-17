import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ['better-auth', 'stripe', 'better-sqlite3', 'pg', 'mysql2'],
  target: 'node20',
  outDir: 'dist',
});

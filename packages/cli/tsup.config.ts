import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'node20',
  external: ['stripe', 'better-sqlite3'],
  banner: { js: '#!/usr/bin/env node' },
});

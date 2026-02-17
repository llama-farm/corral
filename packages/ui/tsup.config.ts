import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/admin.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  treeshake: true,
  external: ['react', 'react-dom'],
  jsx: 'automatic',
});

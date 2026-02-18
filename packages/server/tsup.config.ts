import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: [
    'better-auth', 'better-auth/plugins', 'better-auth/node',
    '@better-auth/stripe', 'stripe',
    'better-sqlite3', 'pg', 'mysql2',
    '@neondatabase/serverless', '@libsql/client', '@planetscale/database',
    'nodemailer', 'resend', 'postmark',
  ],
  target: 'node20',
  outDir: 'dist',
});

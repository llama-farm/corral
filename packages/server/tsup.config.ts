import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/middleware/express.ts', 'src/routes/corral-router.ts'],
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
    'nodemailer', 'resend', 'postmark', 'express',
  ],
  target: 'node20',
  outDir: 'dist',
});

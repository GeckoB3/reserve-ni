import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**'],
    env: {
      // Policy resolver imports Stripe-backed helpers; tests must not require a local .env.
      STRIPE_SECRET_KEY: 'sk_test_vitest_placeholder',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

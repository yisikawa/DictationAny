import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // dist/ のビルド成果物をテストとして拾わないようにする
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});

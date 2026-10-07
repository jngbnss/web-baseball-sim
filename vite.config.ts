/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any path (e.g. GitHub Pages /web-baseball-sim/).
  base: './',
  build: {
    target: 'es2022',
    // Rapier's compat build inlines its WASM (~4 MB, ~1.7 MB gzip). It is loaded as a separate
    // dynamic chunk, so the warning is expected.
    chunkSizeWarningLimit: 4500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

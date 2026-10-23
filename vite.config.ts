/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  css: {
    preprocessorOptions: {
      scss: { quietDeps: true, silenceDeprecations: ['import', 'global-builtin'] },
    },
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});

/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import { readFileSync } from 'fs';

// Auto-externalize all dependencies
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  /__tests__/,
  'vitest',
];

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      src: resolve(__dirname, 'src'),
      '@': resolve(__dirname, 'src'),
      '~': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      exclude: ['src/**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'image/resize': resolve(__dirname, 'src/image/resize.ts'),
        'image/generation': resolve(__dirname, 'src/image/generation.ts'),
        'image/metadata': resolve(__dirname, 'src/image/metadata.ts'),
        'image/data': resolve(__dirname, 'src/image/data.ts'),
        'color/sorting': resolve(__dirname, 'src/color/sorting.ts'),
        'color/processing': resolve(__dirname, 'src/color/processing.ts'),
        'data/file': resolve(__dirname, 'src/data/file.ts'),
        'data/base64': resolve(__dirname, 'src/data/base64.ts'),
        'services/logger': resolve(__dirname, 'src/services/logger.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external,
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
  },
  test: {
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      exclude: ['*.config.*', '*.d.ts'],
    },
  },
});

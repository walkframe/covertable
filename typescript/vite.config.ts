import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        pict: resolve(__dirname, 'src/pict/index.ts'),
      },
      formats: ['es', 'cjs'],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    dts({ rollupTypes: true }),
  ],
});

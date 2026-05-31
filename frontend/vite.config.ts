import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@pages':    resolve(__dirname, 'src/pages'),
      '@shared':   resolve(__dirname, 'src/shared'),
      '@store':    resolve(__dirname, 'src/store'),
      '@api':      resolve(__dirname, 'src/api'),
      '@features': resolve(__dirname, 'src/features'),
      '@queries':  resolve(__dirname, 'src/queries'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});

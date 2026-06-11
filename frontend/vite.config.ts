import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        proxy: {
          '/api/': {
            target: 'https://eixo.agr.br',
            changeOrigin: true,
            secure: false,
          },
        },
      },
      plugins: [react()],
      build: {
        chunkSizeWarningLimit: 1100,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/exceljs')) return 'exceljs';
              if (id.includes('node_modules/xlsx')) return 'xlsx';
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

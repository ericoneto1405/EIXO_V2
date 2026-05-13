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
            target: 'http://localhost:3001',
            changeOrigin: true,
            secure: false,
          },
        },
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/exceljs')) return 'exceljs';
              if (id.includes('node_modules/xlsx')) return 'xlsx';
              if (id.includes('node_modules/papaparse')) return 'papaparse';
              if (id.includes('node_modules/jszip')) return 'jszip';
              if (id.includes('node_modules/@react-google-maps/api') || id.includes('node_modules/togeojson')) return 'map-vendor';
              if (id.includes('node_modules')) return 'vendor';
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

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        counter: resolve(__dirname, 'counter.html'),
        stall: resolve(__dirname, 'stall.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@zxing')) return 'vendor-zxing';
            if (id.includes('chart.js')) return 'vendor-chart';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('qrcode')) return 'vendor-qrcode';
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});

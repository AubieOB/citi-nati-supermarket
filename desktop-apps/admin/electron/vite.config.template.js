/**
 * Vite Configuration for Desktop App Development
 * 
 * This extends the main frontend Vite config for Electron apps.
 * Use this template in each desktop app folder: desktop-apps/{app}/vite.config.js
 * 
 * IMPORTANT: Keep this synchronized with citi-nati-frontend/vite.config.js
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: false, // Don't auto-open in browser (Electron will handle it)
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'auth': ['./src/context/AuthContext.jsx', './src/context/CartContext.jsx'],
        },
      },
    },
  },
  // Environment variables for Electron apps
  define: {
    'process.env.IS_ELECTRON': JSON.stringify(true),
    'process.env.API_URL': JSON.stringify(process.env.REACT_APP_API_URL || 'http://localhost:5000'),
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
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
          'admin': ['./src/pages/admin/AdminDashboard.jsx', './src/components/admin/AdminProducts.jsx', './src/components/admin/AdminStocks.jsx', './src/pages/admin/AdminPOSManagement.jsx'],
          'pages': ['./src/pages/public/Products.jsx', './src/pages/public/Orders.jsx', './src/pages/public/Login.jsx'],
        },
      },
    },
  },
});

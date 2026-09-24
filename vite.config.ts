import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const backendPort = Number(env.BACKEND_PORT || 4000);

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'frontend/src'),
        'firebase/firestore': path.resolve(__dirname, 'frontend/src/api/compat.ts'),
        'firebase/auth': path.resolve(__dirname, 'frontend/src/api/compat.ts'),
        'firebase/storage': path.resolve(__dirname, 'frontend/src/api/compat.ts'),
        'firebase/app': path.resolve(__dirname, 'frontend/src/api/compat.ts'),
        'firebase': path.resolve(__dirname, 'frontend/src/api/compat.ts'),
        '@supabase/supabase-js': path.resolve(__dirname, 'frontend/src/api/compat.ts'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.FRONTEND_PORT || 3000),
      strictPort: false,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        },
        '/health': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});

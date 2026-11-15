import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Local use must never reload the dashboard when runtime data changes.
      // Developers can explicitly opt in with ENABLE_HMR=true.
      hmr: process.env.ENABLE_HMR === 'true' && process.env.DISABLE_HMR !== 'true',
      watch: process.env.ENABLE_HMR === 'true' && process.env.DISABLE_HMR !== 'true'
        ? { ignored: ['**/data/**', '**/data.zip', '**/relatorios/**'] }
        : null,
    },
  };
});

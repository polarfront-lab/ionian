import path from 'path';
import { defineConfig, loadEnv, UserConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: './',
    plugins: [dts({ rollupTypes: true }), nodePolyfills()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_CMS_HOST,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${env.VITE_CMS_TOKEN}`);
            });
          },
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      minify: 'terser',
      emptyOutDir: true,
      outDir: 'dist',
      sourcemap: true,
      lib: {
        entry: path.resolve(__dirname, 'src/index.ts'),
        name: 'ionian',
        formats: ['es', 'iife'],
      },
      rollupOptions: {
        external: ['three', 'three-stdlib'],
        output: {
          globals: {
            three: 'THREE',
            'three-stdlib': 'three-stdlib',
          },
        },
      },
    },
  };
});

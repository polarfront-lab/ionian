import path from 'path';
import { defineConfig, loadEnv, UserConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ command, mode }): UserConfig => {
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
        formats: ['es', 'iife', 'umd'],
      },
      rollupOptions: {
        external: ['three', 'three-stdlib'],
        output: {
          globals: {
            three: 'THREE',
          },
        },
      },
      commonjsOptions: {
        esmExternals: ['three', 'three-stdlib'],
      },
    },
  };
});

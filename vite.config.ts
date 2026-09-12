import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'node:path';

// 功能档位：LUMEDIT_TIER=basic 出「基础版」（仅第一档），缺省/full 出「完整版」
const appTier = process.env.LUMEDIT_TIER === 'basic' ? 'basic' : 'full';

// Electron + Vite + Vue3 脚手架配置
export default defineConfig({
  define: {
    __APP_TIER__: JSON.stringify(appTier),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            // 插件在 package.json type:module 时默认 lib.formats=['es']，必须显式压回 cjs
            lib: { entry: 'electron/main.ts', formats: ['cjs'], fileName: () => 'main.cjs' },
            rollupOptions: {
              output: { format: 'cjs', entryFileNames: '[name].cjs' },
            },
          },
        },
      },
      preload: {
        input: resolve(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: resolve(__dirname, 'electron/preload.ts'),
              formats: ['cjs'],
              fileName: () => 'preload.cjs',
            },
            rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
          },
        },
      },
    }),
    renderer(),
  ],
  worker: {
    // file:// 生产环境下 classic worker 更稳，依赖由 rollup 内联进单文件
    format: 'iife',
  },
  // 生产为 file:// 加载，资源与动态 chunk 全部使用相对路径
  base: './',
  assetsInclude: ['**/*.cube'],
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
    // camera-watermark 工作室整页放在 public/cwm，由 Vite 原样拷到 dist/cwm
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
});

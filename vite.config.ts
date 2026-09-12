import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'node:path';

// Electron + Vite + Vue3 脚手架配置
export default defineConfig({
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
            // 插件默认 lib.formats=['es']（package.json type:module），mergeConfig 对数组是
            // 拼接语义 → 实际为 ['es','cjs'] 双输出。fileName 按格式分流：ES 产物写到独立
            // 文件（打包时排除），main.cjs 只由 CJS 输出写入，避免同名双写互相截断损坏
            // （此前 dev 启动报 SyntaxError 即此因）。
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
              fileName: (format) => (format === 'es' ? 'main.es.mjs' : 'main.cjs'),
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
            // 插件 preload 默认 entryFileNames 为 .mjs（type:module），必须显式压回 .cjs
            rollupOptions: { output: { format: 'cjs', entryFileNames: 'preload.cjs' } },
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

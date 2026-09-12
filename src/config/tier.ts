// 编译期功能档位。Vite 通过 define 把 __APP_TIER__ 静态替换为字面量，
// basic 构建会被 tree-shaking 掉第二档 Stage 与 UI；同一份代码出两个包。
export type AppTier = 'basic' | 'full';

export const APP_TIER: AppTier =
  typeof __APP_TIER__ !== 'undefined' ? __APP_TIER__ : 'full';

/** 是否包含第二档（HSL 混色器 / 颜色分级 / 效果） */
export const IS_FULL_TIER = APP_TIER === 'full';

// 生成内置 .cube LUT 资源（17³，R 变化最快，符合 .cube 标准顺序）
// 运行：node scripts/gen-luts.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/assets/luts');
const SIZE = 17;

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const sat = (r, g, b, k) => {
  const l = luma(r, g, b);
  return [l + (r - l) * k, l + (g - l) * k, l + (b - l) * k];
};
const contrast = (c, k) => (c - 0.5) * k + 0.5;
const lift = (c, x) => c * (1 - x) + x; // 抬黑场

const GRADES = {
  // ---------- 胶片模拟 ----------
  'kodak-2383': (r, g, b) => {
    r = contrast(r, 1.08); g = contrast(g, 1.08); b = contrast(b, 1.08);
    r += 0.02 * (1 - r);
    b -= 0.012 * r;
    [r, g, b] = sat(r, g, b, 1.04);
    return [r, g, b];
  },
  'fuji-3510': (r, g, b) => {
    r = contrast(r, 1.05); g = contrast(g, 1.05); b = contrast(b, 1.05);
    g += 0.01; b += 0.016;
    [r, g, b] = sat(r, g, b, 0.97);
    return [r, g, b];
  },
  'portra-400': (r, g, b) => {
    [r, g, b] = sat(r, g, b, 0.92);
    r = contrast(r, 0.95) + 0.03;
    g = contrast(g, 0.95) + 0.03;
    b = contrast(b, 0.95) + 0.02;
    r += 0.01;
    return [r, g, b];
  },
  'cinestill-800t': (r, g, b) => {
    const l = luma(r, g, b);
    r = contrast(r, 1.1); g = contrast(g, 1.1); b = contrast(b, 1.1);
    // 阴影青、高光暖红（800T 夜景色调）
    const sh = 1 - l;
    b += 0.05 * sh;
    g += 0.025 * sh;
    r += 0.05 * l;
    return sat(r, g, b, 0.96);
  },
  'classic-neg': (r, g, b) => {
    [r, g, b] = sat(r, g, b, 0.95);
    r = contrast(r, 0.96); g = contrast(g, 0.96); b = contrast(b, 0.96);
    const l = luma(r, g, b);
    b += 0.012 * (1 - l); // 暗部微青
    r += 0.008 * l;       // 高光微暖
    return [r + 0.01, g + 0.01, b + 0.01];
  },
  // ---------- 电影感 ----------
  'teal-orange': (r, g, b) => {
    const l = luma(r, g, b);
    const t = Math.max(-1, Math.min(1, (l - 0.5) * 2));
    const sh = [0.0, 0.55, 0.6];
    const hi = [1.0, 0.55, 0.15];
    const k = Math.abs(t) * 0.35;
    const target = t >= 0
      ? [sh[0] + t * (hi[0] - sh[0]), sh[1] + t * (hi[1] - sh[1]), sh[2] + t * (hi[2] - sh[2])]
      : [r, g, b];
    return [r + (target[0] - r) * k, g + (target[1] - g) * k, b + (target[2] - b) * k];
  },
  'cinematic-warm': (r, g, b) => {
    r = contrast(r, 1.12) * 1.04;
    g = contrast(g, 1.12);
    b = contrast(b, 1.12) * 0.96;
    return sat(r, g, b, 0.95);
  },
  'cinematic-cool': (r, g, b) => {
    r = contrast(r, 1.12) * 0.96;
    g = contrast(g, 1.12);
    b = contrast(b, 1.12) * 1.05;
    return sat(r, g, b, 0.95);
  },
  'dark-mood': (r, g, b) => {
    r = contrast(r, 1.2) - 0.08;
    g = contrast(g, 1.2) - 0.08;
    b = contrast(b, 1.2) - 0.06;
    const l = luma(r, g, b);
    b += 0.02 * (1 - l);
    return sat(r, g, b, 0.9);
  },
  // ---------- 黑白 ----------
  'bw-classic': (r, g, b) => {
    const v = contrast(luma(r, g, b), 1.05);
    return [v, v, v];
  },
  'ilford-hp5': (r, g, b) => {
    const v = contrast(luma(r, g, b), 1.32);
    return [v, v, v];
  },
  // ---------- 人像 ----------
  'soft-cream': (r, g, b) => {
    [r, g, b] = sat(r, g, b, 0.9);
    r = contrast(r, 0.9) + 0.06 + 0.012;
    g = contrast(g, 0.9) + 0.06;
    b = contrast(b, 0.9) + 0.06 - 0.01;
    return [r, g, b];
  },
  airy: (r, g, b) => {
    // 通透：提亮、弱对比、轻微冷白
    r = lift(contrast(r, 0.92), 0.05);
    g = lift(contrast(g, 0.92), 0.05);
    b = lift(contrast(b, 0.92), 0.06);
    return sat(r, g, b, 0.93);
  },
  // ---------- 风光 ----------
  velvia: (r, g, b) => {
    [r, g, b] = sat(r, g, b, 1.25);
    return [contrast(r, 1.08), contrast(g, 1.08), contrast(b, 1.08)];
  },
  autumn: (r, g, b) => {
    [r, g, b] = sat(r * 1.06 + 0.01, g, b * 0.9, 1.08);
    return [r, g, b];
  },
  'crisp-fresh': (r, g, b) => {
    // 清新：提亮、植物更绿、天空更蓝
    r = contrast(r, 1.05) + 0.02;
    g = contrast(g, 1.05) + 0.03;
    b = contrast(b, 1.05) + 0.035;
    return sat(r, g, b, 1.1);
  },
  // ---------- 创意 ----------
  'fade-matte': (r, g, b) => {
    r = lift(contrast(r, 0.9), 0.12);
    g = lift(contrast(g, 0.9), 0.12);
    b = lift(contrast(b, 0.9), 0.12);
    return sat(r + 0.006, g, b - 0.006, 0.88);
  },
  cyberpunk: (r, g, b) => {
    const l = luma(r, g, b);
    r = contrast(r, 1.18); g = contrast(g, 1.18); b = contrast(b, 1.18);
    // 暗部蓝紫、高光品红
    const sh = 1 - l;
    r += 0.08 * l - 0.02 * sh;
    g -= 0.05 * sh;
    b += 0.12 * sh + 0.04 * l;
    return sat(r, g, b, 1.15);
  },
  'japanese-film': (r, g, b) => {
    // 日系：低对比、提亮、淡青阴影、奶油高光
    r = lift(contrast(r, 0.88), 0.08) + 0.012;
    g = lift(contrast(g, 0.88), 0.08);
    b = lift(contrast(b, 0.88), 0.08) + 0.012;
    return sat(r, g, b, 0.9);
  },
};

const META = {
  // 胶片模拟 4
  'kodak-2383': { name: 'Kodak 2383', category: 'film', description: '经典柯达电影胶片，暖调奶油高光' },
  'fuji-3510': { name: 'Fuji 3510', category: 'film', description: '富士胶片，清透微冷' },
  'cinestill-800t': { name: 'CineStill 800T', category: 'film', description: '夜景胶片，阴影青、高光暖' },
  'classic-neg': { name: '经典负片', category: 'film', description: '柔和负片质感，暗青暖亮' },
  // 电影感 4
  'teal-orange': { name: '青橙电影', category: 'cinematic', description: '阴影青、高光橙的电影配色' },
  'cinematic-warm': { name: '暖调电影', category: 'cinematic', description: '暖色温高对比电影感' },
  'cinematic-cool': { name: '冷调电影', category: 'cinematic', description: '冷色温高对比电影感' },
  'dark-mood': { name: '暗调氛围', category: 'cinematic', description: '压暗高对比，冷峻氛围' },
  // 人像 3
  'portra-400': { name: 'Portra 400', category: 'portrait', description: '柯达 Portra，柔和暖肤' },
  'soft-cream': { name: '柔肤奶油', category: 'portrait', description: '明亮柔和，奶油肌' },
  airy: { name: '通透亮调', category: 'portrait', description: '清透提亮，冷白肤色' },
  // 风光 3
  velvia: { name: 'Velvia 浓郁', category: 'landscape', description: '高饱和高对比，风光利器' },
  autumn: { name: '秋日暖阳', category: 'landscape', description: '橙金暖调，秋景氛围' },
  'crisp-fresh': { name: '清新通透', category: 'landscape', description: '天蓝草绿，清新明亮' },
  // 黑白 2
  'bw-classic': { name: '经典黑白', category: 'bw', description: '中性灰阶黑白' },
  'ilford-hp5': { name: 'Ilford HP5', category: 'bw', description: '高反差黑白' },
  // 创意 3
  cyberpunk: { name: '赛博朋克', category: 'creative', description: '蓝紫洋红，霓虹夜色' },
  'fade-matte': { name: '哑光褪色', category: 'creative', description: '抬黑场的复古哑光' },
  'japanese-film': { name: '日系淡彩', category: 'creative', description: '低对比清淡日系' },
};

function writeCube(id, fn) {
  const lines = [
    `TITLE "${META[id].name}"`,
    `LUT_3D_SIZE ${SIZE}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
    `# LumEdit built-in LUT · ${META[id].description}`,
  ];
  for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
      for (let r = 0; r < SIZE; r++) {
        const [nr, ng, nb] = fn(r / (SIZE - 1), g / (SIZE - 1), b / (SIZE - 1)).map(clamp);
        const fmt = (v) => v.toFixed(5).padStart(8, ' ');
        lines.push(`${fmt(nr)} ${fmt(ng)} ${fmt(nb)}`);
      }
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${id}.cube`), lines.join('\n') + '\n', 'utf-8');
}

const manifest = {
  version: '1.0.0',
  categories: [
    { id: 'film', name: '胶片模拟' },
    { id: 'cinematic', name: '电影感' },
    { id: 'bw', name: '黑白' },
    { id: 'portrait', name: '人像' },
    { id: 'landscape', name: '风光' },
    { id: 'creative', name: '创意' },
  ],
  luts: [],
};

for (const [id, fn] of Object.entries(GRADES)) {
  writeCube(id, fn);
  manifest.luts.push({
    id,
    name: META[id].name,
    category: META[id].category,
    author: 'LumEdit 内置',
    file: `${id}.cube`,
    size: SIZE,
    description: META[id].description,
  });
  console.log('generated', id);
}

writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
console.log(`\n共 ${manifest.luts.length} 款内置 LUT -> ${OUT}`);

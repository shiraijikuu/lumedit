// 内置 LUT 管理器：manifest 索引 + 按需 ?raw 加载 + 内存缓存（不启动时全量加载）
import manifestJson from '@/assets/luts/manifest.json';
import type { LutData } from './lutTypes';
import { cubeToLutData, parseCube } from './cubeParser';

export interface BuiltinLutInfo {
  id: string;
  name: string;
  category: string;
  author: string;
  file: string;
  size: number;
  description?: string;
}

interface Manifest {
  version: string;
  categories: Array<{ id: string; name: string }>;
  luts: BuiltinLutInfo[];
}

const manifest = manifestJson as Manifest;

// Vite 在构建期收集全部内置 .cube，作为独立 raw chunk 按需加载
const cubeModules = import.meta.glob('../../../assets/luts/*.cube', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

class LutManager {
  private readonly cache = new Map<string, LutData>();

  list(): BuiltinLutInfo[] {
    return manifest.luts;
  }

  categories(): Array<{ id: string; name: string }> {
    return manifest.categories;
  }

  info(id: string): BuiltinLutInfo | undefined {
    return manifest.luts.find((l) => l.id === id);
  }

  /** 按需加载内置 LUT：首次点击才拉取文本 -> 解析 -> 缓存 */
  async load(id: string): Promise<LutData> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const info = this.info(id);
    if (!info) throw new Error(`内置 LUT 已下架或不存在：${id}`);
    const key = `../../../assets/luts/${info.file}`;
    const loader = cubeModules[key];
    if (!loader) throw new Error(`内置 LUT 资源缺失：${info.file}`);
    const text = await loader();
    const parsed = parseCube(text);
    const data = cubeToLutData(parsed);
    this.cache.set(id, data);
    return data;
  }
}

export const lutManager = new LutManager();

// .lightedit 工程文件：只存参数与源图/LUT/水印图片的路径引用，不内嵌任何图像字节
import type { EditParams } from '@/types/EditParams';
import { cloneParams, defaultEditParams } from '@/types/EditParams';

export const PROJECT_EXT = 'lightedit';
const PROJECT_APP = 'lumedit';
const PROJECT_VERSION = 1;

export interface ProjectFile {
  app: 'lumedit';
  version: number;
  createdAt: string;
  source: { path: string; name: string } | null;
  params: EditParams;
  /** 外部 cube LUT 路径引用（内置 LUT 只存 id） */
  externalLut: { path: string; name: string } | null;
}

export class ProjectError extends Error {}

export function serializeProject(opts: {
  sourcePath: string | null;
  sourceName: string;
  params: EditParams;
  externalLut: { path: string; name: string } | null;
}): string {
  const file: ProjectFile = {
    app: PROJECT_APP,
    version: PROJECT_VERSION,
    createdAt: new Date().toISOString(),
    source: opts.sourcePath ? { path: opts.sourcePath, name: opts.sourceName } : null,
    params: cloneParams(opts.params),
    externalLut: opts.externalLut,
  };
  return JSON.stringify(file, null, 2);
}

function mergeParams(incoming: Partial<EditParams>): EditParams {
  const params = cloneParams(defaultEditParams);
  Object.assign(params.geometry, incoming.geometry ?? {});
  Object.assign(params.adjust, incoming.adjust ?? {});
  Object.assign(params.lut, incoming.lut ?? {});
  if (incoming.watermark && incoming.watermark.cwmState && typeof incoming.watermark.cwmState === 'object') {
    params.watermark = {
      enabled: !!incoming.watermark.enabled,
      cwmState: JSON.parse(JSON.stringify(incoming.watermark.cwmState)),
      cwmMeta:
        incoming.watermark.cwmMeta && typeof incoming.watermark.cwmMeta === 'object'
          ? JSON.parse(JSON.stringify(incoming.watermark.cwmMeta))
          : null,
    };
  }
  return params;
}

export function parseProject(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError('工程文件不是合法 JSON');
  }
  const obj = raw as Partial<ProjectFile>;
  if (!obj || obj.app !== PROJECT_APP) {
    throw new ProjectError('不是 LumEdit .lightedit 工程文件');
  }
  if (typeof obj.version !== 'number' || obj.version > PROJECT_VERSION) {
    throw new ProjectError(`工程文件版本 ${obj.version} 高于当前支持版本 ${PROJECT_VERSION}`);
  }
  if (!obj.params || typeof obj.params !== 'object') {
    throw new ProjectError('工程文件缺少 params');
  }
  return {
    app: PROJECT_APP,
    version: obj.version,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : '',
    source: obj.source ?? null,
    params: mergeParams(obj.params as Partial<EditParams>),
    externalLut: obj.externalLut ?? null,
  };
}

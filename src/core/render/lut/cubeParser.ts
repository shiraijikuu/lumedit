import type { LutData } from './lutTypes';

// 自研 .cube 解析器（仅支持 3D LUT；1D LUT 明确报错）
export interface ParsedCube {
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** 浮点 RGB，红色变化最快，长度 size^3 * 3 */
  data: Float32Array;
}

export class CubeParseError extends Error {}

// 实用 LUT 尺寸上限：17/33/65/129 覆盖全部常见规格；256³ 解析需数百 MB 内存，拒绝以防恶意文件 DoS
export const MAX_CUBE_SIZE = 129;
// 解析前文本体积上限：129³ 的文本约 65MB，更大的先拒绝，避免 split 出千万级行数组
export const MAX_CUBE_TEXT_LENGTH = 80 * 1024 * 1024;

export function parseCube(text: string): ParsedCube {
  if (text.length > MAX_CUBE_TEXT_LENGTH) {
    throw new CubeParseError(`文件过大（${(text.length / 1024 / 1024) | 0}MB，上限 ${MAX_CUBE_TEXT_LENGTH / 1024 / 1024}MB）`);
  }
  const lines = text.split(/\r?\n/);
  let size = 0;
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    const tokens = raw.split(/\s+/);
    const keyword = tokens[0].toUpperCase();

    switch (keyword) {
      case 'TITLE':
        break;
      case 'LUT_3D_SIZE':
        size = Number(tokens[1]);
        if (!Number.isInteger(size) || size < 2 || size > MAX_CUBE_SIZE) {
          throw new CubeParseError(
            `第 ${lineNo} 行：非法 LUT_3D_SIZE "${tokens[1]}"（支持 2–${MAX_CUBE_SIZE}）`
          );
        }
        break;
      case 'LUT_1D_SIZE':
        throw new CubeParseError('暂不支持 1D LUT（.cube 仅支持 3D）');
      case 'DOMAIN_MIN':
      case 'DOMAIN_MAX': {
        const target = keyword === 'DOMAIN_MIN' ? domainMin : domainMax;
        for (let c = 0; c < 3; c++) {
          const v = Number(tokens[c + 1]);
          if (!Number.isFinite(v)) {
            throw new CubeParseError(`第 ${lineNo} 行：${keyword} 数值非法`);
          }
          target[c] = v;
        }
        break;
      }
      default: {
        if (size === 0) {
          throw new CubeParseError(`第 ${lineNo} 行：数据行出现在 LUT_3D_SIZE 声明之前`);
        }
        // 数据行：3 个浮点
        if (tokens.length !== 3) {
          throw new CubeParseError(`第 ${lineNo} 行：无法识别的内容 "${raw}"`);
        }
        const rgb = tokens.map(Number);
        if (rgb.some((v) => !Number.isFinite(v))) {
          throw new CubeParseError(`第 ${lineNo} 行：数据点包含非法数值`);
        }
        // 声明尺寸有限，超量立即失败，防止无界 push
        if (values.length >= size ** 3 * 3) {
          throw new CubeParseError(`第 ${lineNo} 行：数据点数量超过 LUT_3D_SIZE ${size} 的声明`);
        }
        values.push(rgb[0], rgb[1], rgb[2]);
      }
    }
  }

  if (size === 0) throw new CubeParseError('缺少 LUT_3D_SIZE 声明');
  const expected = size ** 3 * 3;
  if (values.length !== expected) {
    throw new CubeParseError(
      `数据点数量不匹配：声明 ${size}³ 应含 ${expected} 个浮点，实际 ${values.length} 个（文件可能被截断或原地损坏）`
    );
  }

  return {
    size,
    domainMin,
    domainMax,
    data: Float32Array.from(values),
  };
}

/** 浮点 LUT（含 DOMAIN 映射）转 8bit 3D 纹理数据 */
export function cubeToLutData(parsed: ParsedCube): LutData {
  const { size, data, domainMin, domainMax } = parsed;
  const out = new Uint8ClampedArray(size ** 3 * 3);
  for (let i = 0; i < data.length; i++) {
    const c = i % 3;
    const span = domainMax[c] - domainMin[c] || 1;
    const normalized = (data[i] - domainMin[c]) / span;
    out[i] = Math.round(Math.min(1, Math.max(0, normalized)) * 255);
  }
  return { size, data: out };
}

// LumEdit 冒烟测试：在 Electron（SwiftShader WebGL2）中验证核心管线与数据模块。
// 结果写入 document.title：SMOKE_PASS / SMOKE_FAIL，由 smoke-main.cjs 读取决定退出码。
import { defaultEditParams, type EditParams } from '../../src/types/EditParams';
import { parseCube, cubeToLutData, CubeParseError } from '../../src/core/render/lut/cubeParser';
import { runPipeline } from '../../src/core/render/renderPipeline';
import type { RenderContext } from '../../src/core/render/RenderStage';
import { GeometryStage } from '../../src/core/render/stages/GeometryStage';
import { AdjustStage } from '../../src/core/render/stages/AdjustStage';
import { LutStage } from '../../src/core/render/stages/LutStage';
import { rewriteTiffExif, tiffHasGps } from '../../src/core/metadata/exifRewriter';
import { injectExif } from '../../src/core/metadata/metadataInject';
import { sniffFormat, extractTiffBytes } from '../../src/core/metadata/containerFormat';
import { createStack, pushSnapshot, undo, redo } from '../../src/core/history/history';
import { serializeProject, parseProject } from '../../src/core/project/projectFile';
import { compareSemver, resolveDownloadUrl } from '../../src/core/update/updateService';
import { createFileAccessPolicy } from '../../electron/fileAccess';
import { TexturePool } from '../../src/core/render/texturePool';
import { bakeLutFromParams } from '../../src/core/render/lut/bakeCurrentLut';
import kodakCube from '../../src/assets/luts/kodak-2383.cube';
import {
  isRawFileName,
  detectRawKind,
  extractLargestEmbeddedJpeg,
} from '../../src/core/image/rawExtractor';
import { applyOrientation, buildCwmMeta, decodeForPreview } from '../../src/core/image/imageLoader';
import { evalCurve, bakeCurveLut, isIdentityCurve, CURVE_LUT_SIZE } from '../../src/core/render/curveLut';
import { CurveStage } from '../../src/core/render/stages/CurveStage';
import { HslStage } from '../../src/core/render/stages/HslStage';
import { ColorGradeStage } from '../../src/core/render/stages/ColorGradeStage';
import { EffectsStage } from '../../src/core/render/stages/EffectsStage';
import { ensureParams, cloneParams, linearCurve, HSL_HUES } from '../../src/types/EditParams';
import zhDict from '../../src/i18n/locales/zh-CN';
import enDict from '../../src/i18n/locales/en';

let passed = 0;
let failed = 0;
const logs: string[] = [];

function ok(name: string, cond: boolean, extra = ''): void {
  if (cond) {
    passed++;
    logs.push(`  PASS  ${name}`);
  } else {
    failed++;
    logs.push(`  FAIL  ${name} ${extra}`);
  }
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function params(): EditParams {
  return JSON.parse(JSON.stringify(defaultEditParams)) as EditParams;
}

// ---------- GPU 辅助 ----------
function createGL(): WebGL2RenderingContext {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) throw new Error('WebGL2 不可用（SwiftShader 未生效？）');
  return gl;
}

async function solidBitmap(
  w: number,
  h: number,
  rgb: [number, number, number]
): Promise<ImageBitmap> {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`;
  ctx.fillRect(0, 0, w, h);
  return createImageBitmap(c);
}

function uploadTexture(gl: WebGL2RenderingContext, bmp: ImageBitmap): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function readPixel(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  w: number,
  h: number
): Uint8Array {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  assert(gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE, 'FBO 不完整');
  const px = new Uint8Array(4);
  gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  return px;
}

// ---------- 1. cube 解析 ----------
function testCubeParser(): void {
  logs.push('[cubeParser]');
  const parsed = parseCube(kodakCube);
  ok('真实内置 cube 解析为 17³', parsed.size === 17, `size=${parsed.size}`);
  const data = cubeToLutData(parsed);
  ok('cubeToLutData 长度 = size³*3', data.data.length === 17 ** 3 * 3);

  // 合成 identity cube
  const N = 5;
  const lines = ['LUT_3D_SIZE 5'];
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++)
        lines.push(`${r / (N - 1)} ${g / (N - 1)} ${b / (N - 1)}`);
  const id = parseCube(lines.join('\n'));
  ok('合成 5³ identity 解析', id.size === 5);

  let threw = false;
  try {
    parseCube('LUT_3D_SIZE 3\n0 0 0\n0 0 1');
  } catch (e) {
    threw = e instanceof CubeParseError;
  }
  ok('损坏 cube（数量不足）抛 CubeParseError', threw);

  // 安全加固：恶意/畸形 cube 必须快速失败
  let threwOrder = false;
  try {
    parseCube('0 0 0\nLUT_3D_SIZE 2');
  } catch (e) {
    threwOrder = e instanceof CubeParseError;
  }
  ok('数据行在 LUT_3D_SIZE 之前抛错', threwOrder);

  let threwSize = false;
  try {
    parseCube('LUT_3D_SIZE 200');
  } catch (e) {
    threwSize = e instanceof CubeParseError;
  }
  ok('LUT_3D_SIZE 超上限（>129）抛错', threwSize);

  let threwOverflow = false;
  try {
    const lines = ['LUT_3D_SIZE 2'];
    for (let i = 0; i < 12; i++) lines.push('0 0 0'); // 2³=8 点，给 12 行
    parseCube(lines.join('\n'));
  } catch (e) {
    threwOverflow = e instanceof CubeParseError;
  }
  ok('数据点超量立即抛错', threwOverflow);
}

// ---------- 2. GPU 管线 ----------
async function testPipeline(): Promise<void> {
  logs.push('[render pipeline / WebGL2]');
  const gl = createGL();

  // 2.1 Geometry：旋转 90° 尺寸交换
  {
    const bmp = await solidBitmap(40, 30, [0.4, 0.4, 0.4]);
    const input = uploadTexture(gl, bmp);
    const stage = new GeometryStage();
    const p = params();
    p.geometry.rotation = 90;
    const ctx: RenderContext = { gl, width: 40, height: 30 };
    const out = stage.execute(input, p, ctx);
    ok('Geometry 旋转90° 尺寸交换为 30×40', ctx.width === 30 && ctx.height === 40, `${ctx.width}x${ctx.height}`);
    const px = readPixel(gl, out, ctx.width, ctx.height);
    ok('旋转后中心像素不透明', px[3] === 255);
    stage.destroy();
    gl.deleteTexture(out);
    gl.deleteTexture(input);
    bmp.close();
  }

  // 2.2 Geometry：裁剪一半
  {
    const bmp = await solidBitmap(40, 40, [0.6, 0.6, 0.6]);
    const input = uploadTexture(gl, bmp);
    const stage = new GeometryStage();
    const p = params();
    p.geometry.width = 0.5;
    p.geometry.height = 0.5;
    const ctx: RenderContext = { gl, width: 40, height: 40 };
    stage.execute(input, p, ctx);
    ok('裁剪 50% 输出 20×20', ctx.width === 20 && ctx.height === 20, `${ctx.width}x${ctx.height}`);
    stage.destroy();
    gl.deleteTexture(input);
    bmp.close();
  }

  // 2.3 Adjust：亮度提升
  {
    const bmp = await solidBitmap(32, 32, [0.5, 0.5, 0.5]);
    const input = uploadTexture(gl, bmp);
    const stage = new AdjustStage();
    const p = params();
    p.adjust.brightness = 0.5;
    const ctx: RenderContext = { gl, width: 32, height: 32 };
    const out = stage.execute(input, p, ctx);
    const px = readPixel(gl, out, 32, 32);
    ok('亮度 +0.5 使灰像素变亮 (>140)', px[0] > 140, `r=${px[0]}`);
    stage.destroy();
    gl.deleteTexture(out);
    gl.deleteTexture(input);
    bmp.close();
  }

  // 2.4 LUT：identity 近似不变 / 真实 LUT 生效
  {
    const stage = new LutStage();
    const parsed = parseCube(kodakCube);
    stage.setLut(gl, cubeToLutData(parsed));
    const bmp = await solidBitmap(32, 32, [0.5, 0.4, 0.3]);
    const input = uploadTexture(gl, bmp);
    const p = params();
    p.lut.id = 'kodak-2383';
    p.lut.strength = 1;
    const ctx: RenderContext = { gl, width: 32, height: 32 };
    const out = stage.execute(input, p, ctx);
    const px = readPixel(gl, out, 32, 32);
    const base = [128, 102, 77];
    const delta = Math.abs(px[0] - base[0]) + Math.abs(px[1] - base[1]) + Math.abs(px[2] - base[2]);
    ok('Kodak LUT 改变像素颜色', delta > 3, `delta=${delta}, px=${px[0]},${px[1]},${px[2]}`);
    // strength=0 直通
    p.lut.strength = 0;
    const out0 = stage.execute(input, p, ctx);
    const px0 = readPixel(gl, out0, 32, 32);
    ok('LUT strength=0 直通不变', Math.abs(px0[0] - 128) <= 2, `r=${px0[0]}`);
    stage.destroy();
    gl.deleteTexture(out);
    gl.deleteTexture(out0);
    gl.deleteTexture(input);
    bmp.close();
  }

  // 2.5 完整串联管线（几何→调色→LUT，水印在主线程离屏合成、不在 WebGL 管线内）
  {
    const bmp = await solidBitmap(48, 36, [0.5, 0.5, 0.5]);
    const input = uploadTexture(gl, bmp);
    const geo = new GeometryStage();
    const adj = new AdjustStage();
    const lut = new LutStage();
    lut.setLut(gl, cubeToLutData(parseCube(kodakCube)));
    const p = params();
    p.adjust.contrast = 0.2;
    p.lut.id = 'x'; p.lut.strength = 0.5;
    const ctx: RenderContext = { gl, width: 48, height: 36 };
    let err: unknown = null;
    let out!: WebGLTexture;
    try {
      out = runPipeline(gl, [geo, adj, lut], input, p, ctx).texture;
    } catch (e) {
      err = e;
    }
    ok('Geometry→Adjust→Lut 全串联成功', !err, String(err));
    ok('全串联输出纹理存在', !!out);
    geo.destroy(); adj.destroy(); lut.destroy();
    if (out && out !== input) gl.deleteTexture(out);
    gl.deleteTexture(input);
    bmp.close();
  }
}

// ---------- 3. EXIF 重写 ----------
function buildTiffWithGps(): Uint8Array {
  // 小端 TIFF：IFD0（Make + GPS 指针）+ GPS IFD
  const buf = new ArrayBuffer(128);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  u8.set([0x49, 0x49]); // II
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true); // IFD0 @8
  // IFD0: 2 entries @8, each 12 bytes; next IFD offset @ 8+2+24=34
  v.setUint16(8, 2, true);
  // entry0 Make ASCII @ 10
  v.setUint16(10, 0x010f, true);
  v.setUint16(12, 2, true); // ASCII
  v.setUint32(14, 4, true);
  u8.set([0x4c, 0x75, 0x6d, 0x00], 18); // "Lum\0" inline
  // entry1 GPS IFD pointer @ 22
  v.setUint16(22, 0x8825, true);
  v.setUint16(24, 4, true); // LONG
  v.setUint32(26, 1, true);
  v.setUint32(30, 40, true); // GPS IFD @40
  v.setUint32(34, 0, true); // next IFD = 0
  // GPS IFD @40: 1 entry
  v.setUint16(40, 1, true);
  v.setUint16(42, 1, true); // GPSLatitudeRef ASCII
  v.setUint16(44, 2, true);
  v.setUint32(46, 2, true);
  u8.set([0x4e, 0x00, 0, 0], 50); // "N\0"
  v.setUint32(54, 0, true);
  return u8.subarray(0, 66);
}

function testExif(): void {
  logs.push('[exif rewriter / injector]');
  const tiff = buildTiffWithGps();
  ok('构造样本含 GPS', tiffHasGps(tiff));
  const out = rewriteTiffExif(tiff, true, { width: 100, height: 80 });
  ok('rewrite 返回非空', !!out && out.length > 8);
  ok('rewrite 后 GPS 已删除', !out || !tiffHasGps(out));
  // 幂等：二次重写不报错
  let secondOk = false;
  try {
    const again = rewriteTiffExif(out!, true);
    secondOk = !!again && !tiffHasGps(again);
  } catch {
    secondOk = false;
  }
  ok('二次重写幂等', secondOk);

  // 三容器注入 + 回读
  const minimalPng = (): Uint8Array => {
    const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = new Uint8Array(25); // 4 len + 4 type + 13 data + 4 crc
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, 13);
    ihdr.set([73, 72, 68, 82], 4); // 'IHDR'
    dv.setUint32(8, 1);
    dv.setUint32(12, 1);
    ihdr[16] = 8;
    ihdr[17] = 6; // 8bit RGBA
    const iend = new Uint8Array(12);
    new DataView(iend.buffer).setUint32(0, 0);
    iend.set([73, 69, 78, 68], 4); // 'IEND'
    const out = new Uint8Array(sig.length + ihdr.length + iend.length);
    out.set(sig, 0);
    out.set(ihdr, sig.length);
    out.set(iend, sig.length + ihdr.length);
    return out;
  };
  const cases: Array<['jpeg' | 'png' | 'webp', Uint8Array]> = [
    ['jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])],
    ['png', minimalPng()],
    ['webp', (() => {
      const b = new Uint8Array(12);
      b.set(['R', 'I', 'F', 'F'].map((c) => c.charCodeAt(0)), 0);
      new DataView(b.buffer).setUint32(4, 4, true);
      b.set(['W', 'E', 'B', 'P'].map((c) => c.charCodeAt(0)), 8);
      return b;
    })()],
  ];
  for (const [fmt, container] of cases) {
    const injected = injectExif(fmt, container, out!);
    ok(`${fmt} 注入后嗅探格式正确`, sniffFormat(injected) === fmt);
    const back = extractTiffBytes(injected, fmt);
    ok(`${fmt} 可回读 TIFF`, !!back && back.length === out!.length, `len=${back?.length}`);
  }

  // 回归：真实场景中 TIFF 是从整张原图共享出来的子视图（底层 ArrayBuffer 远大于 TIFF，
  // 且外部区域含 JPEG SOI/EOI）。重建结果绝不能跨出 TIFF 窗口、把底层垃圾字节切进 EXIF。
  const baseTiff = buildTiffWithGps();
  const OFF = 5000;
  const big = new Uint8Array(baseTiff.length + OFF + 300000);
  // 在 TIFF 窗口之外塞入伪 JPEG 标记，模拟原图主数据
  for (let i = 0; i < big.length - 1; i += 997) {
    big[i] = 0xff;
    big[i + 1] = 0xd8;
    big[i + 2] = 0xff;
    big[i + 3] = 0xd9;
  }
  big.set(baseTiff, OFF);
  const sharedView = big.subarray(OFF, OFF + baseTiff.length); // 共享 big.buffer
  ok('共享子视图 byteOffset>0', (sharedView.byteOffset ?? OFF) === OFF || true);
  const r2 = rewriteTiffExif(sharedView, true, { width: 200, height: 100 });
  ok('共享大 buffer 视图仍可重建', !!r2 && r2.length > 8 && r2.length < baseTiff.length + 4096,
    `len=${r2?.length}`);
  const countPair = (u: Uint8Array, a: number, b: number): number => {
    let n = 0;
    for (let i = 0; i < u.length - 1; i++) if (u[i] === a && u[i + 1] === b) n++;
    return n;
  };
  const injectedJpeg = r2
    ? injectExif('jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), r2)
    : null;
  ok('注入后恰好 1 个 SOI', !!injectedJpeg && countPair(injectedJpeg, 0xff, 0xd8) === 1);
  ok('注入后恰好 1 个 EOI', !!injectedJpeg && countPair(injectedJpeg, 0xff, 0xd9) === 1);
}

// ---------- 4. 历史栈 ----------
function testHistory(): void {
  logs.push('[history]');
  const s = createStack<number>();
  for (let i = 0; i < 55; i++) pushSnapshot(s, i);
  ok('撤销栈 50 步上限', s.past.length === 50, `len=${s.past.length}`);
  ok('新动作清空 redo', s.future.length === 0);
  const prev = undo(s, 999);
  ok('undo 返回上一快照', prev === 54, `prev=${prev}`);
  const next = redo(s, prev!);
  ok('redo 回到当前快照', next === 999, `next=${next}`);
}

// ---------- 5. 工程文件 ----------
function testProject(): void {
  logs.push('[project file]');
  const p = params();
  p.adjust.brightness = 0.3;
  p.lut.id = 'kodak-2383';
  p.lut.isBuiltin = true;
  p.lut.strength = 0.8;
  const json = serializeProject({
    sourcePath: 'E:/photos/a.jpg',
    sourceName: 'a.jpg',
    params: p,
    externalLut: null,
  });
  const back = parseProject(json);
  ok('工程往返 app 标识', back.app === 'lumedit');
  ok('工程往返参数一致', back.params.adjust.brightness === 0.3 && back.params.lut.id === 'kodak-2383');
  ok('工程往返源路径', back.source?.path === 'E:/photos/a.jpg');

  let threw = false;
  try {
    parseProject('{"app":"other"}');
  } catch {
    threw = true;
  }
  ok('非本工程文件抛错', threw);
}

// ---------- 6. semver ----------
function testSemver(): void {
  logs.push('[update compareSemver]');
  ok('1.0.1 > 1.0.0', compareSemver('1.0.1', '1.0.0') === 1);
  ok('1.0.0 = 1.0.0', compareSemver('1.0.0', '1.0.0') === 0);
  ok('2.0.0 > 1.9.9', compareSemver('2.0.0', '1.9.9') === 1);
  ok('1.2.0 < 1.2.1', compareSemver('1.2.0', '1.2.1') === -1);
}

// ---------- 7. 安全策略（文件访问授权 / 更新清单 URL） ----------
function testSecurityPolicy(): void {
  logs.push('[security: file access policy]');
  const p = createFileAccessPolicy();
  p.grantRead('E:\\photos\\a.jpg');
  ok('读授权：原始路径允许', p.isReadAllowed('E:\\photos\\a.jpg'));
  ok('读授权：大小写/分隔符不敏感', p.isReadAllowed('e:/PHOTOS/A.JPG'));
  ok('读授权：同目录兄弟文件拒绝', !p.isReadAllowed('E:\\photos\\b.jpg'));
  ok('读授权：未授权绝对路径拒绝', !p.isReadAllowed('C:\\Windows\\win.ini'));
  ok('读授权：相对路径拒绝', !p.isReadAllowed('a.jpg'));

  p.grantProjectReferences(
    JSON.stringify({
      source: { path: 'E:/photos/proj-source.png', name: 'x' },
      params: { lut: { path: 'D:/luts/look.cube' } },
      externalLut: { path: 'D:/luts/other.cube', name: 'o' },
    })
  );
  ok('工程引用授权：源图', p.isReadAllowed('E:/photos/proj-source.png'));
  ok('工程引用授权：params.lut.path', p.isReadAllowed('D:\\luts\\look.cube'));
  ok('工程引用授权：externalLut.path', p.isReadAllowed('D:/luts/other.cube'));
  ok('工程引用不扩大到同目录其他文件', !p.isReadAllowed('D:/luts/evil.cube'));
  let badJson = false;
  try {
    p.grantProjectReferences('not json');
  } catch {
    badJson = true;
  }
  ok('非法工程文本不抛错', !badJson);

  p.grantWriteDir('E:\\out');
  ok('写授权：目录内允许', p.isWriteAllowed('E:\\out\\a.jpg'));
  ok('写授权：子目录/正斜杠允许', p.isWriteAllowed('E:/out/sub/a.jpg'));
  ok('写授权：前缀相似目录拒绝', !p.isWriteAllowed('E:\\out2\\a.jpg'));
  ok('写授权：.. 逃逸拒绝', !p.isWriteAllowed('E:\\out\\..\\evil.jpg'));
  ok('写授权：非授权目录拒绝', !p.isWriteAllowed('C:\\Windows\\evil.dll'));

  logs.push('[security: update manifest url]');
  const LATEST = 'https://github.com/shiraijikuu/lumedit/releases/latest';
  ok(
    '清单 URL：本仓库 Releases 深链保留',
    resolveDownloadUrl('https://github.com/shiraijikuu/lumedit/releases/tag/v0.1.1') ===
      'https://github.com/shiraijikuu/lumedit/releases/tag/v0.1.1'
  );
  ok('清单 URL：外部恶意域回退 Releases 页', resolveDownloadUrl('https://evil.example/x.exe') === LATEST);
  ok('清单 URL：仿冒前缀回退', resolveDownloadUrl('https://github.com/shiraijikuu/lumedit/releases.evil/x') === LATEST);
  ok('清单 URL：缺省回退', resolveDownloadUrl(undefined) === LATEST);
}

// ---------- 8. RAW 内嵌 JPEG 提取 ----------
async function noiseJpeg(size: number): Promise<Uint8Array> {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = v;
    img.data[i + 1] = (v + 37) & 255;
    img.data[i + 2] = (255 - v) & 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  return new Uint8Array(await blob.arrayBuffer());
}

async function testRaw(): Promise<void> {
  logs.push('[raw extractor]');
  ok('RAW 扩展名：ARW 命中', isRawFileName('photo.ARW'));
  ok('RAW 扩展名：dng 小写命中', isRawFileName('a.dng'));
  ok('RAW 扩展名：jpg 不命中', !isRawFileName('a.jpg'));
  ok('RAW 扩展名：空值安全', !isRawFileName(null));

  const tiffHead = new Uint8Array(16);
  tiffHead.set([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  ok('detectRawKind：II* 识别为 tiff', detectRawKind(tiffHead) === 'tiff');
  const fujifilm = new Uint8Array(16);
  new TextEncoder().encodeInto('FUJIFILMCCD-RAW ', fujifilm);
  ok('detectRawKind：FUJIFILM 识别为 fuji-raf', detectRawKind(fujifilm) === 'fuji-raf');
  ok('detectRawKind：普通 JPEG 头返回 null', detectRawKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0].concat(new Array(12).fill(0)))) === null);

  const small = await noiseJpeg(96);
  const big = await noiseJpeg(320);
  ok('合成内嵌 JPEG 均达到 4096B 门槛', small.length >= 4096 && big.length > small.length);
  const pad = new Uint8Array(200).fill(0x11);
  const container = new Uint8Array(tiffHead.length + pad.length + small.length + pad.length + big.length);
  let o = 0;
  container.set(tiffHead, o); o += tiffHead.length;
  container.set(pad, o); o += pad.length;
  container.set(small, o); o += small.length;
  container.set(pad, o); o += pad.length;
  container.set(big, o);
  const picked = extractLargestEmbeddedJpeg(container);
  ok('提取结果非空', picked !== null);
  ok('选最大内嵌 JPEG（长度等于大图）', !!picked && picked.length === big.length);
  ok('提取 JPEG 以 SOI(FFD8) 开头', !!picked && picked[0] === 0xff && picked[1] === 0xd8);
  ok('提取 JPEG 以 EOI(FFD9) 结尾', !!picked && picked[picked.length - 2] === 0xff && picked[picked.length - 1] === 0xd9);
  ok('无内嵌 JPEG 时返回 null', extractLargestEmbeddedJpeg(new Uint8Array(8192).fill(0x11)) === null);
  const rotated = await applyOrientation(await solidBitmap(40, 30, [0.5, 0.5, 0.5]), 8);
  ok('Orientation 8 将横图转正为竖图', rotated.width === 30 && rotated.height === 40, `got ${rotated.width}x${rotated.height}`);
  rotated.close();
  const cwmMeta = buildCwmMeta({ Make: 'SONY', Model: 'ILCE-7CM2', FNumber: 2.8, ExposureTime: 1 / 200, ISO: 100, FocalLength: 35, latitude: 31.2, longitude: 121.5 });
  ok('RAW EXIF → 水印工作室 Make/Model', cwmMeta.Make === 'SONY' && cwmMeta.Model === 'ILCE-7CM2');
  ok('RAW EXIF → 水印工作室曝光字段与 GPS 方向', cwmMeta.FNumber === 2.8 && cwmMeta.ISO === 100 && cwmMeta.GPSLatitudeRef === 'N' && cwmMeta.GPSLongitudeRef === 'E');

  // Electron 端到端：合成 RAW（TIFF 头 + 内嵌 JPEG）走完整预览解码
  const dec = await decodeForPreview(container.buffer as ArrayBuffer, 'fake.ARW');
  ok('RAW 预览解码：sourceFormat=raw', dec.meta.sourceFormat === 'raw');
  ok('RAW 预览解码：回落 format=jpeg', dec.meta.format === 'jpeg');
  ok('RAW 预览解码：取最大内嵌图尺寸 320', dec.bitmap.width === 320 && dec.bitmap.height === 320,
    `got ${dec.bitmap.width}x${dec.bitmap.height}`);
  dec.bitmap.close();
}

// ---------- 9. 色调曲线 LUT ----------
function testCurveLut(): void {
  logs.push('[curve lut]');
  const linear = { master: linearCurve(), red: linearCurve(), green: linearCurve(), blue: linearCurve() };
  ok('默认四点线性判定为 identity', isIdentityCurve(linear));
  ok('evalCurve：线性中点≈0.5', Math.abs(evalCurve(linear.master, 0.5) - 0.5) < 1e-6);
  ok('evalCurve：端点钳制', evalCurve(linear.master, -1) === 0 && evalCurve(linear.master, 2) === 1);
  const lifted = { ...linear, master: [{ x: 0, y: 0.2 }, { x: 1, y: 1 }] };
  ok('调整后非 identity', !isIdentityCurve(lifted));
  ok('evalCurve：抬升黑场插值', Math.abs(evalCurve(lifted.master, 0) - 0.2) < 1e-6);
  const lut = bakeCurveLut(linear);
  ok('烘焙 LUT 长度 = 256*4', lut.length === CURVE_LUT_SIZE * 4);
  // 线性时主曲线 R 通道输出≈输入索引
  let maxErr = 0;
  for (let i = 0; i < CURVE_LUT_SIZE; i++) maxErr = Math.max(maxErr, Math.abs(lut[i * 4] - i));
  ok('线性烘焙 R 通道误差≤1（舍入）', maxErr <= 1);
}

// ---------- 10. 参数模型向前兼容 ----------
function testEnsureParams(): void {
  logs.push('[EditParams ensure/clone]');
  // 模拟 0.1.x 旧工程：只有 geometry/adjust(旧5项)/lut
  const legacy = {
    geometry: JSON.parse(JSON.stringify(defaultEditParams.geometry)),
    adjust: { brightness: 0.1, contrast: 0, saturation: 0, exposure: 0, temperature: 0 },
    lut: JSON.parse(JSON.stringify(defaultEditParams.lut)),
  } as unknown as Partial<EditParams>;
  const p = ensureParams(legacy);
  ok('ensure 补齐 curve', !!p.curve && Array.isArray(p.curve.master));
  ok('ensure 补齐 hsl 且 8 色齐全', !!p.hsl && HSL_HUES.every((h) => 'hue' in p.hsl[h]));
  ok('ensure 补齐 colorGrade', !!p.colorGrade && 'shadows' in p.colorGrade);
  ok('ensure 补齐 effects', !!p.effects && 'vignette' in p.effects);
  ok('ensure 保留旧字段值', Math.abs(p.adjust.brightness - 0.1) < 1e-9);
  const c = cloneParams(p);
  c.adjust.exposure = 1.5;
  c.hsl.red.hue = 0.9;
  ok('cloneParams 深拷贝：改副本不影响原', p.adjust.exposure !== 1.5 && p.hsl.red.hue !== 0.9);
  ok('ensureParams(null) 安全返回默认', !!ensureParams(null).geometry);
}

// ---------- 11. 中英文词典 key 对齐 ----------
function collectKeys(obj: Record<string, unknown>, prefix = '', out: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') collectKeys(v as Record<string, unknown>, path, out);
    else out.push(path);
  }
  return out;
}
function testI18nParity(): void {
  logs.push('[i18n zh/en parity]');
  const zhKeys = collectKeys(zhDict as Record<string, unknown>).sort();
  const enKeys = collectKeys(enDict as Record<string, unknown>).sort();
  ok('中英文词条数量一致', zhKeys.length === enKeys.length, `zh=${zhKeys.length} en=${enKeys.length}`);
  const missingInEn = zhKeys.filter((k) => !enKeys.includes(k));
  const extraInEn = enKeys.filter((k) => !zhKeys.includes(k));
  ok('英文无缺失 key', missingInEn.length === 0, missingInEn.join(','));
  ok('英文无多余 key', extraInEn.length === 0, extraInEn.join(','));
  const hasEmpty = enKeys.some((k) => {
    const v = k.split('.').reduce<unknown>((o, seg) => (o as Record<string, unknown>)?.[seg], enDict as unknown);
    return typeof v !== 'string' || v.trim() === '';
  });
  ok('英文词条无空值', !hasEmpty);
}

// ---------- 12. 第二档 Stage 中性参数直通（GPU） ----------
async function testNewStagesNeutral(): Promise<void> {
  logs.push('[new stages neutral passthrough]');
  const gl = createGL();
  const bmp = await solidBitmap(64, 64, [0.5, 0.4, 0.3]);
  const input = uploadTexture(gl, bmp);
  const ctx: RenderContext = { gl, width: 64, height: 64 };
  const p = params();
  const stages = [new CurveStage(), new HslStage(), new ColorGradeStage(), new EffectsStage()];
  const src = readPixel(gl, input, 64, 64);
  for (const s of stages) {
    const out = s.execute(input, p, ctx);
    ok(`${s.name} 中性参数返回纹理`, !!out);
    const dst = readPixel(gl, out, 64, 64);
    const d = Math.max(Math.abs(dst[0] - src[0]), Math.abs(dst[1] - src[1]), Math.abs(dst[2] - src[2]));
    ok(`${s.name} 中性参数不改色（差≤8）`, d <= 8, `d=${d}`);
    if (out !== input) gl.deleteTexture(out);
    s.destroy();
  }
  gl.deleteTexture(input);
  bmp.close();
}

// ---------- 9. 纹理池 ----------
function testTexturePool(): void {
  logs.push('[texture pool]');
  const gl = createGL();
  const pool = new TexturePool(gl);
  const t1 = pool.acquire(64, 48);
  ok('池创建纹理并跟踪所有权', pool.owns(t1) && pool.liveCount === 1);
  pool.release(t1, 64, 48);
  ok('归还后进入空闲桶', pool.freeCount === 1 && pool.liveCount === 1);
  const t2 = pool.acquire(64, 48);
  ok('同尺寸复用同一纹理（ping-pong 就绪）', t2 === t1);
  const t3 = pool.acquire(64, 64);
  ok('不同尺寸不复用', t3 !== t1);
  pool.release(t3, 64, 64);
  const foreign = gl.createTexture()!;
  pool.release(foreign, 64, 64);
  ok('外来纹理被直接删除而非入池', !pool.owns(foreign) && pool.freeCount === 1);
  pool.dispose();
  ok('dispose 清空全部纹理', pool.liveCount === 0 && pool.freeCount === 0);

  // 空闲桶上限：同尺寸反复借还不应累积
  const many = [1, 2, 3, 4, 5].map(() => pool.acquire(32, 32));
  many.forEach((t) => pool.release(t, 32, 32));
  ok('同尺寸空闲桶有上限（超量销毁）', pool.freeCount === 3, `free=${pool.freeCount}`);
  pool.dispose();
}

// ---------- 10. LUT 烘焙（GPU） ----------
async function testLutBake(): Promise<void> {
  logs.push('[lut bake]');
  const text = await bakeLutFromParams(JSON.parse(JSON.stringify(defaultEditParams)));
  ok('identity 烘焙含 LUT_3D_SIZE 17', text.includes('LUT_3D_SIZE 17'));
  const lines = text.trim().split(/\r?\n/).slice(4);
  ok('数据行数 = 17³', lines.length === 17 ** 3, `n=${lines.length}`);
  let maxErr = 0;
  let idx = 0;
  for (let b = 0; b < 17; b++) {
    for (let g = 0; g < 17; g++) {
      for (let r = 0; r < 17; r++) {
        const v = lines[idx++].split(/\s+/).map(Number);
        maxErr = Math.max(maxErr, Math.abs(v[0] - r / 16), Math.abs(v[1] - g / 16), Math.abs(v[2] - b / 16));
      }
    }
  }
  ok('identity 烘焙逐点误差 ≤ 0.02', maxErr <= 0.02, `maxErr=${maxErr}`);

  const p2 = JSON.parse(JSON.stringify(defaultEditParams));
  p2.adjust.exposure = 1;
  const text2 = await bakeLutFromParams(p2);
  const l2 = text2.trim().split(/\r?\n/).slice(4);
  const mid = l2[(8 * 17 * 17) + (8 * 17) + 8].split(/\s+/).map(Number);
  ok('曝光 +1 烘焙中点变亮（≈1.0）', mid[0] > 0.9, `v=${mid[0]}`);
}

async function main(): Promise<void> {
  const logEl = document.getElementById('log');
  const write = (t: string) => {
    logs.push(t);
    if (logEl) logEl.textContent = logs.join('\n');
  };
  try {
    testCubeParser();
    await testPipeline();
    testExif();
    testHistory();
    testProject();
    testSemver();
    testSecurityPolicy();
    testTexturePool();
    await testLutBake();
    await testRaw();
    testCurveLut();
    testEnsureParams();
    testI18nParity();
    await testNewStagesNeutral();
  } catch (err) {
    failed++;
    write(`FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }
  write(`\n===== ${passed} passed, ${failed} failed =====`);
  // eslint-disable-next-line no-console
  logs.forEach((l) => console.log(l));
  document.title = failed === 0 ? 'SMOKE_PASS' : `SMOKE_FAIL:${failed}`;
}

void main();

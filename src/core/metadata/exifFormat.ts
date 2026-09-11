// 移植自 camera-watermark/photo.py 已验证的 EXIF 格式化与机型友好名逻辑

function trimNum(n: number, decimals = 2): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const s = n.toFixed(decimals);
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** 快门：1/x 秒在 5% 容差内显示为分数 */
export function formatShutter(t: number | undefined | null): string {
  if (t == null || !Number.isFinite(t) || t <= 0) return '';
  if (t >= 1) return `${trimNum(t)}s`;
  const inv = 1 / t;
  const rounded = Math.round(inv);
  if (Math.abs(rounded - inv) / inv < 0.05) return `1/${rounded}s`;
  return `${trimNum(t)}s`;
}

export function formatAperture(f: number | undefined | null): string {
  if (f == null || !Number.isFinite(f) || f <= 0) return '';
  return `f/${trimNum(f)}`;
}

export function formatIso(iso: number | undefined | null): string {
  if (iso == null || !Number.isFinite(iso) || iso <= 0) return '';
  return `ISO${Math.round(iso)}`;
}

export function formatFocal(mm: number | undefined | null): string {
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return '';
  return `${trimNum(mm)}mm`;
}

/** 'YYYY:MM:DD HH:MM:SS' -> {date:'YYYY-MM-DD', time:'HH:MM'} */
export function formatDateTime(s: string | Date | undefined | null): { date: string; time: string } {
  if (!s) return { date: '', time: '' };
  const str = typeof s === 'string' ? s.trim() : String(s);
  if (str.includes(' ')) {
    const [d, t] = str.split(' ');
    return { date: d.replace(/:/g, '-'), time: t.slice(0, 5) };
  }
  return { date: str.replace(/:/g, '-'), time: '' };
}

const MAKE_MAP: Record<string, string> = {
  SONY: 'Sony',
  'NIKON CORPORATION': 'Nikon',
  NIKON: 'Nikon',
  CANON: 'Canon',
  FUJIFILM: 'Fujifilm',
  PANASONIC: 'Panasonic',
  'OLYMPUS IMAGING CORP.': 'Olympus',
  OLYMPUS: 'Olympus',
  'OM Digital Solutions': 'OM System',
  PENTAX: 'Pentax',
  RICOH: 'Ricoh',
  LEICA: 'Leica',
  HASSELBLAD: 'Hasselblad',
  APPLE: 'Apple',
  GOOGLE: 'Google',
  SAMSUNG: 'Samsung',
  HUAWEI: 'Huawei',
  XIAOMI: 'Xiaomi',
  HONOR: 'Honor',
  ONEPLUS: 'OnePlus',
  OPPO: 'OPPO',
  VIVO: 'vivo',
  DJI: 'DJI',
};

const SONY_MODEL_MAP: Record<string, string> = {
  'ILCE-1': 'Alpha 1',
  'ILCE-7C': 'A7C',
  'ILCE-7CM2': 'A7C II',
  'ILCE-7CR': 'A7CR',
  'ILCE-7': 'A7',
  'ILCE-7M2': 'A7 II',
  'ILCE-7M3': 'A7 III',
  'ILCE-7M4': 'A7 IV',
  'ILCE-7RM': 'A7R',
  'ILCE-7RM2': 'A7R II',
  'ILCE-7RM3': 'A7R III',
  'ILCE-7RM4': 'A7R IV',
  'ILCE-7RM4A': 'A7R IV',
  'ILCE-7RM5': 'A7R V',
  'ILCE-7S': 'A7S',
  'ILCE-7SM2': 'A7S II',
  'ILCE-7SM3': 'A7S III',
  'ILCE-9': 'A9',
  'ILCE-9M2': 'A9 II',
  'ILCE-9M3': 'A9 III',
  'ILCE-6000': 'A6000',
  'ILCE-6100': 'A6100',
  'ILCE-6300': 'A6300',
  'ILCE-6400': 'A6400',
  'ILCE-6500': 'A6500',
  'ILCE-6600': 'A6600',
  'ILCE-6700': 'A6700',
  'DSC-RX100': 'RX100',
  'DSC-RX100M2': 'RX100 II',
  'DSC-RX100M3': 'RX100 III',
  'DSC-RX100M4': 'RX100 IV',
  'DSC-RX100M5': 'RX100 V',
  'DSC-RX100M5A': 'RX100 V',
  'DSC-RX100M6': 'RX100 VI',
  'DSC-RX100M7': 'RX100 VII',
  'ZV-E10': 'ZV-E10',
  'ZV-E10II': 'ZV-E10 II',
  'ZV-E1': 'ZV-E1',
  'ZV-1': 'ZV-1',
  'ZV-1F': 'ZV-1F',
};

const BRAND_WORDS = [
  'redmi', 'xiaomi', 'poco', 'mi ', 'honor', 'huawei', 'oppo', 'vivo', 'iqoo',
  'realme', 'oneplus', 'samsung', 'galaxy', 'iphone', 'apple', 'google', 'pixel',
  'sony', 'canon', 'nikon', 'fujifilm', 'fuji', 'panasonic', 'leica', 'dji',
  'meizu', 'nubia', 'zte', 'nokia', 'motorola',
];

function hasBrandPrefix(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  return BRAND_WORDS.some((w) => t.startsWith(w));
}

export function friendlyCameraName(
  make: string | undefined | null,
  model: string | undefined | null
): string {
  const m = (make || '').trim();
  const mo = (model || '').trim();
  const cleanMake = MAKE_MAP[m.toUpperCase()] ?? m;
  if (!mo) return cleanMake;
  if (m.toUpperCase() === 'SONY' && SONY_MODEL_MAP[mo]) return `Sony ${SONY_MODEL_MAP[mo]}`;
  if (hasBrandPrefix(mo)) return mo;
  return cleanMake ? `${cleanMake} ${mo}` : mo;
}

// ---------------- 水印模板占位符（移植 render_template） ----------------

export interface ExifTextValues {
  camera: string;
  make: string;
  model: string;
  shutter: string;
  aperture: string;
  iso: string;
  focal: string;
  lens: string;
  date: string;
  time: string;
  [key: string]: string;
}

/** {key} 占位符替换；值缺失替换为空串；保留用户手动空格与空行 */
export function renderTextTemplate(template: string, values: Record<string, string>): string {
  if (!template) return '';
  const out = template.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => values[key] ?? '');
  const lines = out.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.some((l) => l.trim())) return '';
  return lines.join('\n');
}

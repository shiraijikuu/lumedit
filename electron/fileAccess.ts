// 文件访问授权策略（纯 TS、无 Node 依赖，主进程与冒烟测试共用）。
// 威胁模型：渲染层被攻破（XSS / 恶意 studio 页面）后，不得借 IPC 任意读写磁盘。
// 授权只来自用户手势：
//   读 —— 用户通过对话框选择的文件，以及用户打开的 .lightedit 工程里引用的路径；
//   写 —— 用户通过对话框选择的输出目录之内。
// 授权随主进程内存存活于本次会话，不落盘。

export interface FileAccessPolicy {
  grantRead(path: string): void;
  grantWriteDir(dir: string): void;
  isReadAllowed(path: string): boolean;
  isWriteAllowed(path: string): boolean;
  /** 从工程 JSON 文本提取引用路径（源图 / 外部 LUT）并授予读权限；非法文本静默跳过，由渲染层负责报错 */
  grantProjectReferences(projectText: string): void;
}

/** 词法归一化：反斜杠统一为 `/`、消解 `.`/`..`、去空段，结果大写（Windows 不区分大小写）。越出根返回空串 */
export function normalizePath(p: string): string {
  const isUnc = p.startsWith('\\\\') || p.startsWith('//');
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop();
      } else if (isUnc) {
        return ''; // \\server\.. 越界
      } else {
        parts.push('..');
      }
      continue;
    }
    parts.push(seg);
  }
  const joined = parts.join('/');
  return (isUnc ? '//' + joined : joined).toUpperCase();
}

/** 归一化后的绝对路径：盘符根（C:/…）或 UNC（//server/share/…） */
function isAbsoluteNormalized(n: string): boolean {
  return /^([A-Z]:\/|\/\/)/.test(n);
}

/** 从用户打开的工程文本里可能引用外部文件的字段 */
function projectReferencePaths(obj: unknown): string[] {
  const o = obj as {
    source?: { path?: unknown } | null;
    params?: { lut?: { path?: unknown } | null } | null;
    externalLut?: { path?: unknown } | null;
  } | null;
  const out: string[] = [];
  for (const p of [o?.source?.path, o?.params?.lut?.path, o?.externalLut?.path]) {
    if (typeof p === 'string' && p) out.push(p);
  }
  return out;
}

export function createFileAccessPolicy(): FileAccessPolicy {
  const readPaths = new Set<string>();
  const writeDirs = new Set<string>();

  const grantRead = (p: string): void => {
    const n = normalizePath(p);
    if (n && isAbsoluteNormalized(n)) readPaths.add(n);
  };

  return {
    grantRead,
    grantWriteDir(dir: string): void {
      const n = normalizePath(dir);
      if (n && isAbsoluteNormalized(n)) writeDirs.add(n);
    },
    isReadAllowed(p: string): boolean {
      const n = normalizePath(p);
      return !!n && isAbsoluteNormalized(n) && readPaths.has(n);
    },
    isWriteAllowed(p: string): boolean {
      const n = normalizePath(p);
      if (!n || !isAbsoluteNormalized(n)) return false;
      for (const d of writeDirs) {
        // 目录边界必须落在分隔符上，防止 E:\out 匹配 E:\out2
        if (n.startsWith(d + '/')) return true;
      }
      return false;
    },
    grantProjectReferences(projectText: string): void {
      try {
        for (const p of projectReferencePaths(JSON.parse(projectText))) grantRead(p);
      } catch {
        /* 非法工程文本：不授权任何路径 */
      }
    },
  };
}

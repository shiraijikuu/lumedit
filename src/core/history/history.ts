// 参数式撤销栈（纯函数，便于单测）：只存参数快照，不存图像数据
export interface SnapshotStack<T> {
  past: T[];
  future: T[];
}

export function createStack<T>(): SnapshotStack<T> {
  return { past: [], future: [] };
}

/** 压入历史快照；超过上限丢弃最旧记录；任何新动作都清空 redo 栈 */
export function pushSnapshot<T>(
  stack: SnapshotStack<T>,
  snapshot: T,
  limit = 50
): void {
  stack.past.push(snapshot);
  if (stack.past.length > limit) stack.past.shift();
  stack.future = [];
}

export function canUndo<T>(stack: SnapshotStack<T>): boolean {
  return stack.past.length > 0;
}

export function canRedo<T>(stack: SnapshotStack<T>): boolean {
  return stack.future.length > 0;
}

/** 撤销：当前状态进 future，返回上一个状态；无可撤销返回 null */
export function undo<T>(stack: SnapshotStack<T>, current: T): T | null {
  const prev = stack.past.pop();
  if (prev === undefined) return null;
  stack.future.push(current);
  return prev;
}

/** 重做：当前状态进 past，返回下一个状态 */
export function redo<T>(stack: SnapshotStack<T>, current: T): T | null {
  const next = stack.future.pop();
  if (next === undefined) return null;
  stack.past.push(current);
  return next;
}

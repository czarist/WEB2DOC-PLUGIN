// Line-by-line comparison of two captures (Myers' O(ND) algorithm).

export type DiffLine =
  | { kind: "same"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string };

const MAX_EDIT_DISTANCE = 20_000;

/** The edits that turn `before` into `after`, in order. */
export function diffLines(before: readonly string[], after: readonly string[]): DiffLine[] {
  // Trim the common start and end first; most captures differ in a few places.
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  const head: DiffLine[] = before.slice(0, start).map((text) => ({ kind: "same", text }));
  const tail: DiffLine[] = before.slice(endBefore).map((text) => ({ kind: "same", text }));
  return [...head, ...middle(a, b), ...tail];
}

function middle(a: readonly string[], b: readonly string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((text) => ({ kind: "added", text }));
  if (m === 0) return a.map((text) => ({ kind: "removed", text }));
  const max = Math.min(n + m, MAX_EDIT_DISTANCE);
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];

  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[offset + k - 1] as number) < (v[offset + k + 1] as number))
        ? (v[offset + k + 1] as number)
        : (v[offset + k - 1] as number) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) {
    // Too different to align line by line: show everything as replaced.
    return [...a.map((text): DiffLine => ({ kind: "removed", text })), ...b.map((text): DiffLine => ({ kind: "added", text }))];
  }

  const result: DiffLine[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const previous = trace[d] as Int32Array;
    const k = x - y;
    const prevK = k === -d || (k !== d && (previous[offset + k - 1] as number) < (previous[offset + k + 1] as number)) ? k + 1 : k - 1;
    const prevX = previous[offset + prevK] as number;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      result.push({ kind: "same", text: a[--x] as string });
      y--;
    }
    if (x === prevX) result.push({ kind: "added", text: b[--y] as string });
    else result.push({ kind: "removed", text: a[--x] as string });
  }
  while (x > 0 && y > 0) {
    result.push({ kind: "same", text: a[--x] as string });
    y--;
  }
  return result.reverse();
}

export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number; same: number } {
  return {
    added: lines.filter((line) => line.kind === "added").length,
    removed: lines.filter((line) => line.kind === "removed").length,
    same: lines.filter((line) => line.kind === "same").length
  };
}

const CONTEXT = 2;

/** Lines to show: every change with a little context, and markers for skipped runs. */
export function visibleLines(lines: readonly DiffLine[], onlyChanges: boolean): Array<DiffLine | { kind: "gap"; count: number }> {
  if (!onlyChanges) return [...lines];
  const keep = lines.map((line) => line.kind !== "same");
  const near = lines.map((_line, index) => keep.slice(Math.max(0, index - CONTEXT), index + CONTEXT + 1).some(Boolean));
  const result: Array<DiffLine | { kind: "gap"; count: number }> = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (near[index]) {
      if (skipped) result.push({ kind: "gap", count: skipped });
      skipped = 0;
      result.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped) result.push({ kind: "gap", count: skipped });
  return result;
}

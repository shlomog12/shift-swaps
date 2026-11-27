/** Spelling-tolerant comparison of roster names, to catch "did you mean…?" before a new name is created. */

const FINAL: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/** Lower-case, no niqqud, punctuation or doubled spaces, final letters as regular ones. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '') // niqqud and cantillation
    .replace(/["'`׳״\-–.]/g, ' ')
    .replace(/[ךםןףץ]/g, (c) => FINAL[c])
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/**
 * Names from the list that look like the typed one: the same after normalizing, one or two letters apart
 * (one for short names), or one containing the other as a whole word ("דני" and "דני כהן").
 * Closest first, at most `limit`. The exact same name is not a suggestion.
 */
export function similarNames(typed: string, names: string[], limit = 3): string[] {
  const t = normalizeName(typed);
  if (t.length < 2) return [];
  const scored: [string, number][] = [];
  for (const name of names) {
    if (name === typed.trim()) continue;
    const n = normalizeName(name);
    if (!n) continue;
    const distance = levenshtein(t, n);
    const allowed = Math.min(t.length, n.length) <= 4 ? 1 : 2;
    const words = (s: string) => s.split(' ');
    const shared = words(t).some((w) => w.length >= 2 && words(n).includes(w));
    if (distance === 0 || distance <= allowed) scored.push([name, distance]);
    else if (shared) scored.push([name, allowed + 1]);
  }
  return scored
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'he'))
    .slice(0, limit)
    .map(([name]) => name);
}

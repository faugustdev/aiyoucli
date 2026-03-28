/**
 * Fuzzy command suggestion via Levenshtein distance.
 */

export function suggestCommand(
  input: string,
  commands: string[],
  maxDistance = 3
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;

  for (const cmd of commands) {
    const d = levenshtein(input.toLowerCase(), cmd.toLowerCase());
    if (d < bestDist && d <= maxDistance) {
      bestDist = d;
      best = cmd;
    }
  }

  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row optimization
  const row = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(
        row[j] + 1,       // deletion
        prev + 1,          // insertion
        row[j - 1] + cost  // substitution
      );
      row[j - 1] = prev;
      prev = val;
    }
    row[n] = prev;
  }

  return row[n];
}

import { normalizeName, similarNames } from './similar';

export type NameCheck =
  | { status: 'empty' }
  | { status: 'known'; name: string }
  /** Not on the roster; `suggestion` is a close roster name, when there is one. */
  | { status: 'new'; suggestion: string | null };

/**
 * Checks a typed name against the roster, so a typo ("דנאלי", "דניאלי ") does not quietly become a new
 * person. A name that only differs in case, spaces, punctuation or final letters counts as the roster's own.
 */
export function checkName(typed: string | null | undefined, roster: string[]): NameCheck {
  const value = (typed ?? '').trim();
  if (!value) return { status: 'empty' };
  const normal = normalizeName(value);
  const same = roster.find((n) => normalizeName(n) === normal);
  if (same) return { status: 'known', name: same };
  return { status: 'new', suggestion: similarNames(value, roster, 1)[0] ?? null };
}

import { api } from './api';
import { sameName, useQuery } from './hooks';

/**
 * Whether someone with this roster name has joined the app (picked the name). Only then can they see and
 * approve requests themselves; until then only an admin can. Undefined while loading.
 */
export function useIsRegistered(name: string | null | undefined): boolean | undefined {
  const names = useQuery(api.rosterNames, []);
  if (!name || !names.data) return undefined;
  return names.data.some((n) => n.claimed && sameName(n.name, name));
}

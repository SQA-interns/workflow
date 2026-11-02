import type { Role } from './api';

export const ROLE_LABEL: Record<Role, string> = { OWNER: 'Lastnik', EDITOR: 'Urednik', VIEWER: 'Bralec' };

const RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

export function can(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

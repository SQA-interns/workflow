import { PREDEFINED_FIELDS, type ContactState } from './api';
import { FIELD_LABEL } from './contactForm';

export interface Change {
  label: string;
  old: string | null;
  new: string | null;
}

/** What changed from `before` (null for the first Revision) to `after`: fields, Attributes and Tags. */
export function diff(before: ContactState | null, after: ContactState): Change[] {
  const out: Change[] = [];
  PREDEFINED_FIELDS.forEach((f) => {
    const o = before ? before[f] : null;
    const n = after[f];
    if ((o ?? null) !== (n ?? null)) out.push({ label: FIELD_LABEL[f], old: o ?? null, new: n ?? null });
  });
  const oldAttrs = new Map((before?.attributes ?? []).map((a) => [a.key.toLowerCase(), a]));
  const newAttrs = new Map(after.attributes.map((a) => [a.key.toLowerCase(), a]));
  after.attributes.forEach((a) => {
    const prev = oldAttrs.get(a.key.toLowerCase());
    if (!prev || prev.value !== a.value) out.push({ label: `Atribut ${a.key}`, old: prev?.value ?? null, new: a.value });
  });
  (before?.attributes ?? []).forEach((a) => {
    if (!newAttrs.has(a.key.toLowerCase())) out.push({ label: `Atribut ${a.key}`, old: a.value, new: null });
  });
  const oldTags = before?.tags ?? [];
  const added = after.tags.filter((t) => !oldTags.some((o) => o.toLowerCase() === t.toLowerCase()));
  const removed = oldTags.filter((t) => !after.tags.some((o) => o.toLowerCase() === t.toLowerCase()));
  const renamed = after.tags.filter((t) => oldTags.some((o) => o !== t && o.toLowerCase() === t.toLowerCase()));
  added.forEach((t) => out.push({ label: 'Oznaka', old: null, new: t }));
  removed.forEach((t) => out.push({ label: 'Oznaka', old: t, new: null }));
  renamed.forEach((t) => out.push({ label: 'Oznaka', old: oldTags.find((o) => o.toLowerCase() === t.toLowerCase()) ?? null, new: t }));
  if (before && before.deleted !== after.deleted)
    out.push({ label: 'Stanje', old: before.deleted ? 'izbrisan' : 'aktiven', new: after.deleted ? 'izbrisan' : 'aktiven' });
  return out;
}

import { PREDEFINED_FIELDS, type Attribute, type Contact, type ContactInput, type PredefinedField } from './api';

export const FIELD_LABEL: Record<PredefinedField, string> = {
  firstName: 'Ime',
  lastName: 'Priimek',
  email: 'E-pošta',
  phone: 'Telefon',
  company: 'Podjetje',
  jobTitle: 'Delovno mesto',
  street: 'Ulica',
  postalCode: 'Poštna številka',
  city: 'Kraj',
  country: 'Država',
  note: 'Opomba',
};

export const MAX_LENGTH: Record<PredefinedField, number> = {
  firstName: 100,
  lastName: 100,
  email: 254,
  phone: 50,
  company: 200,
  jobTitle: 200,
  street: 200,
  postalCode: 20,
  city: 100,
  country: 2,
  note: 2000,
};

const KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,49}$/;
const RESERVED = new Set([...PREDEFINED_FIELDS.map((f) => f.toLowerCase()), 'id', 'tags']);

export interface FormValues {
  fields: Record<PredefinedField, string>;
  attributes: Attribute[];
  tags: string;
}

export function emptyForm(): FormValues {
  const fields = Object.fromEntries(PREDEFINED_FIELDS.map((f) => [f, ''])) as Record<PredefinedField, string>;
  return { fields, attributes: [], tags: '' };
}

export function formFrom(c: Contact): FormValues {
  const fields = Object.fromEntries(PREDEFINED_FIELDS.map((f) => [f, c[f] ?? ''])) as Record<PredefinedField, string>;
  return { fields, attributes: c.attributes.map((a) => ({ ...a })), tags: c.tags.join(' ') };
}

export function splitTags(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function toInput(v: FormValues): ContactInput {
  const out = {} as ContactInput;
  PREDEFINED_FIELDS.forEach((f) => {
    const t = v.fields[f].trim();
    out[f] = t === '' ? null : f === 'country' ? t.toUpperCase() : t;
  });
  out.attributes = v.attributes.map((a) => ({ key: a.key.trim(), value: a.value.trim() }));
  out.tags = splitTags(v.tags);
  return out;
}

/** The obvious mistakes, checked before sending; keys match the API's field names. */
export function validate(v: FormValues): Record<string, string> {
  const e: Record<string, string> = {};
  const input = toInput(v);
  PREDEFINED_FIELDS.forEach((f) => {
    const value = input[f];
    if (value && f !== 'country' && value.length > MAX_LENGTH[f]) e[f] = `Največ ${MAX_LENGTH[f]} znakov.`;
  });
  if (!e.email && input.email && !/^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(input.email))
    e.email = 'Vnesite veljaven e-poštni naslov.';
  if (!e.country && input.country && !/^[A-Z]{2}$/.test(input.country))
    e.country = 'Vnesite veljavno dvočrkovno kodo države (npr. SI).';
  if (!input.firstName && !input.lastName && !input.email && !e.firstName)
    e.firstName = 'Vnesite vsaj ime, priimek ali e-pošto.';
  if (input.attributes.length > 100) e.attributes = 'Največ 100 atributov.';
  const keys = new Set<string>();
  input.attributes.forEach((a, i) => {
    const lower = a.key.toLowerCase();
    if (!KEY.test(a.key)) e[`attributes[${i}].key`] = 'Ključ mora se začeti s črko in vsebovati le črke, števke, _, . ali -.';
    else if (RESERVED.has(lower)) e[`attributes[${i}].key`] = 'Ključ je enak imenu vnaprej določenega polja.';
    else if (keys.has(lower)) e[`attributes[${i}].key`] = 'Ključ se ponavlja.';
    keys.add(lower);
    if (!a.value) e[`attributes[${i}].value`] = 'Polje je obvezno.';
    else if (a.value.length > 500) e[`attributes[${i}].value`] = 'Največ 500 znakov.';
  });
  const tags = input.tags;
  if (tags.length > 50) e.tags = 'Največ 50 oznak.';
  const seen = new Set<string>();
  tags.forEach((t, i) => {
    if (t.length > 50) e[`tags[${i}]`] = `Oznaka »${t.slice(0, 20)}…« je daljša od 50 znakov.`;
    else if (seen.has(t.toLowerCase())) e[`tags[${i}]`] = `Oznaka »${t}« se ponavlja.`;
    seen.add(t.toLowerCase());
  });
  return e;
}

/** Error text for the tags input: the list error or the first per-Tag error. */
export function tagsError(errors: Record<string, string>): string | undefined {
  if (errors.tags) return errors.tags;
  const key = Object.keys(errors).find((k) => k.startsWith('tags['));
  return key ? errors[key] : undefined;
}

export function attributesError(errors: Record<string, string>): string | undefined {
  return errors.attributes;
}

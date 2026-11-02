import { describe, expect, it } from 'vitest';
import { PREDEFINED_FIELDS } from '../src/lib/api';
import { FIELD_LABEL, MAX_LENGTH, emptyForm, formFrom, splitTags, tagsError, toInput, validate, type FormValues } from '../src/lib/contactForm';
import { contact } from './helpers';

function form(over: Partial<FormValues['fields']> = {}, rest: Partial<FormValues> = {}): FormValues {
  const f = emptyForm();
  return { ...f, ...rest, fields: { ...f.fields, firstName: 'Ana', ...over } };
}

describe('Contact form rules', () => {
  it('labels every Predefined field in Slovenian', () => {
    expect(FIELD_LABEL).toEqual({
      firstName: 'Ime', lastName: 'Priimek', email: 'E-pošta', phone: 'Telefon', company: 'Podjetje', jobTitle: 'Delovno mesto',
      street: 'Ulica', postalCode: 'Poštna številka', city: 'Kraj', country: 'Država', note: 'Opomba',
    });
    expect(MAX_LENGTH).toEqual({
      firstName: 100, lastName: 100, email: 254, phone: 50, company: 200, jobTitle: 200, street: 200, postalCode: 20, city: 100, country: 2, note: 2000,
    });
  });

  it('accepts every field at its maximum length and refuses one more character', () => {
    for (const f of PREDEFINED_FIELDS.filter((x) => x !== 'country' && x !== 'email')) {
      expect(validate(form({ [f]: 'x'.repeat(MAX_LENGTH[f]) }))[f], f).toBeUndefined();
      expect(validate(form({ [f]: 'x'.repeat(MAX_LENGTH[f] + 1) }))[f], f).toBe(`Največ ${MAX_LENGTH[f]} znakov.`);
    }
  });

  it('checks the whole email and a two-letter country', () => {
    expect(validate(form({ email: 'ana@primer.si' })).email).toBeUndefined();
    for (const bad of ['x ana@primer.si', 'ana@primer.si x', 'ana@primer.s', 'ana@primer', 'a@b@c.si'])
      expect(validate(form({ email: bad })).email, bad).toBe('Vnesite veljaven e-poštni naslov.');
    expect(validate(form({ country: 'si' })).country).toBeUndefined();
    expect(validate(form({ country: 'SVN' })).country).toMatch(/dvočrkovno/);
    expect(validate(form({ country: 'S1' })).country).toMatch(/dvočrkovno/);
    expect(validate(form({ firstName: '', email: 'x'.repeat(250) + '@a.si' })).email).toBe('Največ 254 znakov.');
  });

  it('requires a first name, last name or email', () => {
    expect(validate(form({ firstName: '  ' })).firstName).toBe('Vnesite vsaj ime, priimek ali e-pošto.');
    expect(validate(form({ firstName: '', lastName: 'Kos' })).firstName).toBeUndefined();
    expect(validate(form({ firstName: '', email: 'a@b.si' })).firstName).toBeUndefined();
    expect(validate(form({ firstName: 'x'.repeat(101) })).firstName).toBe('Največ 100 znakov.');
  });

  it('checks Attribute keys, values and their number', () => {
    const attrs = (list: [string, string][]) => form({}, { attributes: list.map(([key, value]) => ({ key, value })) });
    expect(validate(attrs([['a', '1'], ['b' + 'x'.repeat(49), 'v'], ['c_d.e-f', 'v']]))).toEqual({});
    expect(validate(attrs([['x', 'v'], ['b' + 'x'.repeat(50), 'v']]))['attributes[1].key']).toMatch(/začeti s črko/);
    expect(validate(attrs([['1a', 'v']]))['attributes[0].key']).toMatch(/začeti s črko/);
    expect(validate(attrs([['a b', 'v']]))['attributes[0].key']).toMatch(/začeti s črko/);
    expect(validate(attrs([['a', 'v'], ['ab!', 'v']]))['attributes[1].key']).toMatch(/začeti s črko/);
    for (const reserved of ['Email', 'POSTALCODE', 'id', 'Tags', 'jobtitle'])
      expect(validate(attrs([[reserved, 'v']]))['attributes[0].key'], reserved).toBe('Ključ je enak imenu vnaprej določenega polja.');
    expect(validate(attrs([['ok', '  ']]))['attributes[0].value']).toBe('Polje je obvezno.');
    expect(validate(attrs([['ok', 'x'.repeat(500)]]))['attributes[0].value']).toBeUndefined();
    expect(validate(attrs([['ok', 'x'.repeat(501)]]))['attributes[0].value']).toBe('Največ 500 znakov.');
    const hundred = Array.from({ length: 100 }, (_, i) => [`k${i}`, 'v'] as [string, string]);
    expect(validate(attrs(hundred)).attributes).toBeUndefined();
    expect(validate(attrs([...hundred, ['k100', 'v']])).attributes).toBe('Največ 100 atributov.');
  });

  it('checks Tags: at most 50, each at most 50 characters, no repeats', () => {
    const tags = (t: string) => validate(form({}, { tags: t }));
    const fifty = Array.from({ length: 50 }, (_, i) => `t${i}`).join(' ');
    expect(tags(fifty).tags).toBeUndefined();
    expect(tags(fifty + ' t50').tags).toBe('Največ 50 oznak.');
    expect(tags('x'.repeat(50))['tags[0]']).toBeUndefined();
    expect(tags('ok ' + 'abcdefghijklmnopqrstuvwxyz'.repeat(2))['tags[1]']).toBe('Oznaka »abcdefghijklmnopqrst…« je daljša od 50 znakov.');
    expect(tags('vip, Vip')['tags[1]']).toBe('Oznaka »Vip« se ponavlja.');
    expect(tagsError({ tags: 'A', 'tags[3]': 'B' })).toBe('A');
    expect(tagsError({ firstName: 'X', 'tags[3]': 'B' })).toBe('B');
    expect(tagsError({ firstName: 'X' })).toBeUndefined();
  });

  it('splits Tags on spaces and commas', () => {
    expect(splitTags('  a,b  c,,d ')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitTags('')).toEqual([]);
  });

  it('turns the form into trimmed input with blanks as null and an upper-case country', () => {
    const input = toInput(
      form({ firstName: '  Ana ', lastName: '   ', country: ' si ' }, { attributes: [{ key: ' k ', value: ' v ' }], tags: ' a b ' }),
    );
    expect(input.firstName).toBe('Ana');
    expect(input.lastName).toBeNull();
    expect(input.country).toBe('SI');
    expect(input.attributes).toEqual([{ key: 'k', value: 'v' }]);
    expect(input.tags).toEqual(['a', 'b']);
  });

  it('fills the form from a Contact without sharing its Attributes', () => {
    const c = contact({ city: null, attributes: [{ key: 'k', value: 'v' }], tags: ['a', 'b'] });
    const f = formFrom(c);
    expect(f.fields.firstName).toBe('Saša');
    expect(f.fields.city).toBe('');
    expect(f.tags).toBe('a b');
    expect(f.attributes).toEqual([{ key: 'k', value: 'v' }]);
    f.attributes[0].value = 'changed';
    expect(c.attributes[0].value).toBe('v');
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError, type ContactState } from '../src/lib/api';
import { useApi, useAuth } from '../src/lib/context';
import { diff } from '../src/lib/diff';
import { errorText, fieldErrors, slMessage } from '../src/lib/messages';
import { can } from '../src/lib/roles';

function state(over: Partial<ContactState> = {}): ContactState {
  return {
    firstName: 'Ana', lastName: null, email: null, phone: null, company: null, jobTitle: null, street: null,
    postalCode: null, city: null, country: null, note: null, attributes: [], tags: [], deleted: false, mergedInto: null,
    ...over,
  };
}

describe('messages: English API messages in Slovenian', () => {
  it('translates known messages, limits and ranges', () => {
    expect(slMessage('required')).toBe('Polje je obvezno.');
    expect(slMessage('at most 50 characters')).toBe('Največ 50 znakov.');
    expect(slMessage('between 1 and 100')).toBe('Dovoljeno je od 1 do 100.');
    expect(slMessage('something new')).toBe('Neveljavna vrednost.');
  });

  it('keys field errors by field, first one wins, ignoring errors without a field', () => {
    const e = new ApiError(400, [
      { field: 'email', message: 'must be a valid email' },
      { field: 'email', message: 'required' },
      { field: null, message: 'not found' },
    ]);
    expect(fieldErrors(e)).toEqual({ email: 'Vnesite veljaven e-poštni naslov.' });
    expect(fieldErrors(new Error('x'))).toEqual({});
  });

  it('describes a failed call in one sentence', () => {
    expect(errorText(new ApiError(404, []))).toBe('Ni najdeno.');
    expect(errorText(new ApiError(403, []))).toBe('Za to dejanje nimate pravic.');
    expect(errorText(new ApiError(429, []))).toBe('Preveč zahtev. Poskusite znova čez minuto.');
    expect(errorText(new ApiError(409, [{ field: 'version', message: 'outdated version' }]))).toMatch(/nekdo drug/);
    expect(errorText(new ApiError(500, []))).toBe('Prišlo je do napake.');
    expect(errorText(new TypeError('network'))).toBe('Povezava s strežnikom ni uspela.');
  });
});

describe('diff of two Revisions', () => {
  it('lists every value of the first Revision', () => {
    expect(diff(null, state({ city: 'Kranj', tags: ['a'], attributes: [{ key: 'k', value: 'v' }] }))).toEqual([
      { label: 'Ime', old: null, new: 'Ana' },
      { label: 'Kraj', old: null, new: 'Kranj' },
      { label: 'Atribut k', old: null, new: 'v' },
      { label: 'Oznaka', old: null, new: 'a' },
    ]);
  });

  it('shows changed, removed and renamed values and the deleted state', () => {
    const before = state({ attributes: [{ key: 'k', value: '1' }, { key: 'gone', value: 'x' }], tags: ['vip', 'old'] });
    const after = state({ firstName: null, attributes: [{ key: 'K', value: '2' }], tags: ['VIP'], deleted: true });
    expect(diff(before, after)).toEqual([
      { label: 'Ime', old: 'Ana', new: null },
      { label: 'Atribut K', old: '1', new: '2' },
      { label: 'Atribut gone', old: 'x', new: null },
      { label: 'Oznaka', old: 'old', new: null },
      { label: 'Oznaka', old: 'vip', new: 'VIP' },
      { label: 'Stanje', old: 'aktiven', new: 'izbrisan' },
    ]);
    expect(diff(after, before).at(-1)).toEqual({ label: 'Stanje', old: 'izbrisan', new: 'aktiven' });
  });

  it('is empty when nothing changed', () => {
    expect(diff(state({ attributes: [{ key: 'k', value: 'v' }] }), state({ attributes: [{ key: 'k', value: 'v' }] }))).toEqual([]);
  });
});

describe('roles', () => {
  it('orders Viewer < Editor < Owner', () => {
    expect(can('OWNER', 'EDITOR')).toBe(true);
    expect(can('EDITOR', 'EDITOR')).toBe(true);
    expect(can('VIEWER', 'EDITOR')).toBe(false);
    expect(can('EDITOR', 'OWNER')).toBe(false);
  });
});

describe('contexts', () => {
  it('fail clearly outside their providers', () => {
    function UsesApi() {
      useApi();
      return null;
    }
    function UsesAuth() {
      useAuth();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<UsesApi />)).toThrow('ApiContext missing');
    expect(() => render(<UsesAuth />)).toThrow('AuthContext missing');
    console.error = spy;
    expect(screen.queryByText('x')).toBeNull();
  });
});

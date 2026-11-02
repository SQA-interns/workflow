import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';
import { errorText, slMessage } from '../src/lib/messages';
import { ROLE_LABEL } from '../src/lib/roles';
import { KIND_LABEL } from '../src/pages/DuplicatesPage';
import { contact, fakeApi, renderApp, workspace } from './helpers';

describe('Slovenian texts', () => {
  it('translates every API message', () => {
    const expected: Record<string, string> = {
      required: 'Polje je obvezno.',
      'must be text': 'Vrednost mora biti besedilo.',
      'must be a valid email': 'Vnesite veljaven e-poštni naslov.',
      'must be an ISO 3166-1 alpha-2 country code': 'Vnesite veljavno dvočrkovno kodo države (npr. SI).',
      'first name, last name or email is required': 'Vnesite vsaj ime, priimek ali e-pošto.',
      'must equal the Workspace name exactly': 'Ime se ne ujema natančno z imenom delovnega prostora.',
      'invalid key': 'Ključ mora se začeti s črko in vsebovati le črke, števke, _, . ali -.',
      'duplicate key': 'Ključ se ponavlja.',
      'reserved key': 'Ključ je enak imenu vnaprej določenega polja.',
      'too many attributes': 'Največ 100 atributov.',
      'invalid tag': 'Oznaka ne sme vsebovati presledkov in je dolga največ 50 znakov.',
      'duplicate tag': 'Oznaka se ponavlja.',
      'too many tags': 'Največ 50 oznak.',
      'outdated version': 'Kontakt je medtem spremenil nekdo drug. Osvežite stran.',
      'already a member or invited': 'Ta oseba je že član ali je že povabljena.',
      'a workspace needs an owner': 'Delovni prostor mora imeti vsaj enega lastnika.',
      'tag name taken': 'Oznaka s tem imenom že obstaja.',
      'contact is not deleted': 'Kontakt ni izbrisan.',
      'contact is deleted': 'Kontakt je izbrisan.',
      'not found': 'Ni najdeno.',
      forbidden: 'Za to dejanje nimate pravic.',
      'too many requests': 'Preveč zahtev. Poskusite znova čez minuto.',
      'request body too large': 'Zahteva je prevelika.',
      'invalid role': 'Neveljavna vloga.',
      'invalid selection': 'Neveljaven izbor kontaktov.',
      'too many contacts': 'Izvoz je omejen na 10.000 kontaktov.',
      'exactly one of contactIds and filter': 'Izberite kontakte ali uporabite filter.',
    };
    for (const [en, sl] of Object.entries(expected)) expect(slMessage(en), en).toBe(sl);
    expect(slMessage('at most 12 characters')).toBe('Največ 12 znakov.');
    expect(slMessage('x at most 12 characters')).toBe('Neveljavna vrednost.');
    expect(slMessage('at most 12 characters!')).toBe('Neveljavna vrednost.');
    expect(slMessage('between 10 and 200')).toBe('Dovoljeno je od 10 do 200.');
    expect(slMessage('size between 1 and 2')).toBe('Neveljavna vrednost.');
    expect(errorText(new ApiError(400, [{ field: null, message: 'invalid selection' }]))).toBe('Neveljaven izbor kontaktov.');
  });

  it('names Roles and match kinds', () => {
    expect(ROLE_LABEL).toEqual({ OWNER: 'Lastnik', EDITOR: 'Urednik', VIEWER: 'Bralec' });
    expect(KIND_LABEL).toEqual({ EMAIL: 'E-pošta', PHONE: 'Telefon', NAME: 'Ime in priimek' });
  });

  it('names every Revision type on the history page and shows "—" for absent values', async () => {
    const types = ['CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'MERGE', 'MERGED_AWAY'] as const;
    const labels = ['Ustvarjen', 'Spremenjen', 'Izbrisan', 'Obnovljen', 'Združen (ohranjen)', 'Združen v drug kontakt'];
    const base = { ...contact(), deleted: false, mergedInto: null };
    const revisions = types.map((type, i) => ({
      number: i + 1,
      type,
      author: { id: 'u', email: 'a@b.si', displayName: 'Ana' },
      createdAt: '2026-03-04T10:05:00Z',
      state: { ...base, city: i % 2 === 0 ? null : 'Kranj' },
    }));
    renderApp(
      '/w/w1/kontakti/c1/zgodovina',
      fakeApi({ getWorkspace: vi.fn(async () => workspace('VIEWER')), getContact: vi.fn(async () => contact({ version: 6 })), listRevisions: vi.fn(async () => revisions) }),
    );
    for (const [i, label] of labels.entries()) {
      const item = await screen.findByRole('listitem', { name: `Revizija ${i + 1}` });
      expect(within(item).getByRole('heading')).toHaveTextContent(`Revizija ${i + 1}: ${label}`);
    }
    const second = screen.getByRole('listitem', { name: 'Revizija 2' });
    expect(within(second).getByRole('row', { name: /Kraj/ })).toHaveTextContent('Kraj—Kranj');
    const third = screen.getByRole('listitem', { name: 'Revizija 3' });
    expect(within(third).getByRole('row', { name: /Kraj/ })).toHaveTextContent('KrajKranj—');
    expect(within(second).getByText(/4\. mar\. 2026/)).toBeInTheDocument();

  });
});

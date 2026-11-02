import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

describe('Attributes in the Contact form', () => {
  it('adds, changes and removes Attributes, keeping their order', async () => {
    const updateContact = vi.fn(async () => ({ ...contact(), possibleDuplicates: [] }));
    const api = fakeApi({
      getWorkspace: vi.fn(async () => workspace('EDITOR')),
      getContact: vi.fn(async () => contact({ attributes: [{ key: 'kompetenca', value: 'spletnoProgramiranje' }, { key: 'b', value: '2' }] })),
      updateContact,
    });
    renderApp('/w/w1/kontakti/c1/uredi', api);
    expect(await screen.findByLabelText('Ključ 1')).toHaveValue('kompetenca');
    await userEvent.click(screen.getByRole('button', { name: 'Odstrani atribut 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    await userEvent.type(screen.getByLabelText('Ključ 2'), 'jezik');
    await userEvent.type(screen.getByLabelText('Vrednost 2'), 'slovenščina');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(updateContact).toHaveBeenCalled());
    const input = (updateContact.mock.calls[0] as unknown[])[3] as { attributes: unknown };
    expect(input.attributes).toEqual([
      { key: 'kompetenca', value: 'spletnoProgramiranje' },
      { key: 'jezik', value: 'slovenščina' },
    ]);
  });

  it('refuses malformed, repeated and reserved keys before sending', async () => {
    const createContact = vi.fn();
    renderApp('/w/w1/kontakti/nov', fakeApi({ getWorkspace: vi.fn(async () => workspace('EDITOR')), createContact }));
    await userEvent.type(await screen.findByLabelText('Ime'), 'Ana');
    for (const [k, v] of [['1x', 'a'], ['Email', 'b'], ['ok', 'c'], ['OK', 'd']]) {
      await userEvent.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
      const n = screen.getAllByLabelText(/^Ključ \d+$/).length;
      await userEvent.type(screen.getByLabelText(`Ključ ${n}`), k);
      await userEvent.type(screen.getByLabelText(`Vrednost ${n}`), v);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(screen.getByLabelText('Ključ 1')).toHaveAccessibleDescription(/začeti s črko/);
    expect(screen.getByLabelText('Ključ 2')).toHaveAccessibleDescription(/vnaprej določenega polja/);
    expect(screen.getByLabelText('Ključ 3')).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText('Ključ 4')).toHaveAccessibleDescription('Ključ se ponavlja.');
    expect(createContact).not.toHaveBeenCalled();
  });

  it('shows the backend error next to the Attribute', async () => {
    const createContact = vi.fn(async () => {
      throw new ApiError(400, [{ field: 'attributes[0].value', message: 'at most 500 characters' }]);
    });
    renderApp('/w/w1/kontakti/nov', fakeApi({ getWorkspace: vi.fn(async () => workspace('EDITOR')), createContact }));
    await userEvent.type(await screen.findByLabelText('Ime'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    await userEvent.type(screen.getByLabelText('Ključ 1'), 'opis');
    await userEvent.type(screen.getByLabelText('Vrednost 1'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(screen.getByLabelText('Vrednost 1')).toHaveAccessibleDescription('Največ 500 znakov.'));
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

function api(over: Partial<Api> = {}, role: 'OWNER' | 'EDITOR' | 'VIEWER' = 'EDITOR') {
  return fakeApi({ getWorkspace: vi.fn(async () => workspace(role)), ...over });
}

describe('AC-005-09 Contact form', () => {
  it('shows field errors next to the fields and sends nothing when invalid', async () => {
    const createContact = vi.fn();
    renderApp('/w/w1/kontakti/nov', api({ createContact }));
    await userEvent.type(await screen.findByLabelText('E-pošta'), 'ni-email');
    await userEvent.type(screen.getByLabelText('Država (koda, npr. SI)'), 'Slovenija');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(screen.getByLabelText('E-pošta')).toHaveAccessibleDescription('Vnesite veljaven e-poštni naslov.');
    expect(screen.getByLabelText('Država (koda, npr. SI)')).toHaveAccessibleDescription(/dvočrkovno kodo/);
    expect(createContact).not.toHaveBeenCalled();
  });

  it('requires a first name, last name or email', async () => {
    const createContact = vi.fn();
    renderApp('/w/w1/kontakti/nov', api({ createContact }));
    await userEvent.type(await screen.findByLabelText('Podjetje'), 'Samo podjetje');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(screen.getByLabelText('Ime')).toHaveAccessibleDescription('Vnesite vsaj ime, priimek ali e-pošto.');
    expect(createContact).not.toHaveBeenCalled();
  });

  it('keeps the typed values and shows the backend field errors after a rejection', async () => {
    const createContact = vi.fn(async () => {
      throw new ApiError(400, [{ field: 'country', message: 'must be an ISO 3166-1 alpha-2 country code' }]);
    });
    renderApp('/w/w1/kontakti/nov', api({ createContact }));
    await userEvent.type(await screen.findByLabelText('Ime'), 'Čedomir');
    await userEvent.type(screen.getByLabelText('Država (koda, npr. SI)'), 'XX');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Država (koda, npr. SI)')).toHaveAccessibleDescription(/dvočrkovno kodo/),
    );
    expect(screen.getByLabelText('Ime')).toHaveValue('Čedomir');
    expect(screen.getByLabelText('Država (koda, npr. SI)')).toHaveValue('XX');
  });

  it('sends trimmed values and opens the saved Contact', async () => {
    const createContact = vi.fn(async () => ({ ...contact({ id: 'new' }), possibleDuplicates: [] }));
    const getContact = vi.fn(async () => contact({ id: 'new' }));
    renderApp('/w/w1/kontakti/nov', api({ createContact, getContact }));
    await userEvent.type(await screen.findByLabelText('Ime'), '  Saša ');
    await userEvent.type(screen.getByLabelText('Država (koda, npr. SI)'), 'si');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(createContact).toHaveBeenCalled());
    const input = (createContact.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(input.firstName).toBe('Saša');
    expect(input.country).toBe('SI');
    expect(input.lastName).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Saša Novak' })).toBeInTheDocument();
  });

  it('updates with the version it was based on and reports a conflict', async () => {
    const updateContact = vi.fn(async () => {
      throw new ApiError(409, [{ field: 'version', message: 'outdated version' }]);
    });
    renderApp('/w/w1/kontakti/c1/uredi', api({ getContact: vi.fn(async () => contact({ version: 4 })), updateContact }));
    await userEvent.clear(await screen.findByLabelText('Priimek'));
    await userEvent.type(screen.getByLabelText('Priimek'), 'Kos');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(await screen.findByText(/medtem spremenil nekdo drug/)).toBeInTheDocument();
    expect(updateContact).toHaveBeenCalledWith('w1', 'c1', 4, expect.objectContaining({ lastName: 'Kos' }));
    expect(screen.getByLabelText('Priimek')).toHaveValue('Kos');
  });
});

describe('Contact page', () => {
  it('hides changing controls from Viewers', async () => {
    renderApp('/w/w1/kontakti/c1', api({ getContact: vi.fn(async () => contact()) }, 'VIEWER'));
    expect(await screen.findByRole('heading', { name: 'Saša Novak' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Uredi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Izbriši' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zgodovina sprememb' })).toBeInTheDocument();
  });

  it('an Editor deletes and restores', async () => {
    const deleteContact = vi.fn(async () => {});
    renderApp('/w/w1/kontakti/c1', api({ getContact: vi.fn(async () => contact({ version: 3 })), deleteContact }));
    await userEvent.click(await screen.findByRole('button', { name: 'Izbriši' }));
    expect(deleteContact).toHaveBeenCalledWith('w1', 'c1', 3);
  });

  it('a Deleted contact shows the restore control for Editors and purge only for Owners', async () => {
    const getContact = vi.fn(async () => contact({ deleted: true }));
    const restoreContact = vi.fn(async () => contact());
    const { unmount } = renderApp('/w/w1/kontakti/c1', api({ getContact, restoreContact }, 'EDITOR'));
    await userEvent.click(await screen.findByRole('button', { name: 'Obnovi kontakt' }));
    expect(restoreContact).toHaveBeenCalledWith('w1', 'c1');
    expect(screen.queryByRole('button', { name: 'Trajno izbriši' })).not.toBeInTheDocument();
    unmount();
    renderApp('/w/w1/kontakti/c1', api({ getContact }, 'OWNER'));
    expect(await screen.findByRole('button', { name: 'Trajno izbriši' })).toBeInTheDocument();
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { contact, fakeApi, renderApp, workspace } from './helpers';

describe('Workspace deletion', () => {
  it('requires the exact name before calling the API, then returns to the list', async () => {
    const deleteWorkspace = vi.fn(async () => {});
    renderApp('/w/w1/nastavitve', fakeApi({ getWorkspace: vi.fn(async () => workspace('OWNER', 'Projekt X')), deleteWorkspace }));
    await userEvent.type(await screen.findByLabelText('Ime za potrditev'), 'projekt x');
    await userEvent.click(screen.getByRole('button', { name: 'Trajno izbriši' }));
    expect(screen.getByLabelText('Ime za potrditev')).toHaveAccessibleDescription(/ne ujema natančno/);
    expect(deleteWorkspace).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Ime za potrditev'));
    await userEvent.type(screen.getByLabelText('Ime za potrditev'), 'Projekt X');
    await userEvent.click(screen.getByRole('button', { name: 'Trajno izbriši' }));
    await waitFor(() => expect(deleteWorkspace).toHaveBeenCalledWith('w1', 'Projekt X'));
    expect(await screen.findByRole('heading', { name: 'Delovni prostori' })).toBeInTheDocument();
  });

  it('is not offered to Editors', async () => {
    renderApp('/w/w1/nastavitve', fakeApi({ getWorkspace: vi.fn(async () => workspace('EDITOR')) }));
    expect(await screen.findByText('Za to stran nimate pravic.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trajno izbriši' })).not.toBeInTheDocument();
  });
});

describe('Purge of a Deleted contact', () => {
  it('an Owner purges after confirming', async () => {
    const purgeContact = vi.fn(async () => {});
    renderApp(
      '/w/w1/kontakti/c1',
      fakeApi({ getWorkspace: vi.fn(async () => workspace('OWNER')), getContact: vi.fn(async () => contact({ deleted: true })), purgeContact }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Trajno izbriši' }));
    expect(purgeContact).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi trajni izbris' }));
    await waitFor(() => expect(purgeContact).toHaveBeenCalledWith('w1', 'c1'));
  });

  it('is not offered for an active Contact', async () => {
    renderApp('/w/w1/kontakti/c1', fakeApi({ getWorkspace: vi.fn(async () => workspace('OWNER')), getContact: vi.fn(async () => contact()) }));
    await screen.findByRole('heading', { name: 'Saša Novak' });
    expect(screen.queryByRole('button', { name: 'Trajno izbriši' })).not.toBeInTheDocument();
  });
});

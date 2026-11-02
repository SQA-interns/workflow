import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';
import { fakeApi, fakeAuth, renderApp, workspace } from './helpers';

describe('AC-001-04 sign-in and sign-out', () => {
  it('shows the sign-in page on every URL when signed out', () => {
    for (const path of ['/', '/w/w1', '/w/w1/kontakti/c1', '/anything']) {
      const { unmount } = renderApp(path, fakeApi(), fakeAuth(null));
      expect(screen.getByRole('heading', { name: 'Prijava' })).toBeInTheDocument();
      unmount();
    }
  });

  it('signs in with email and password', async () => {
    const auth = fakeAuth(null);
    renderApp('/', fakeApi(), auth);
    await userEvent.type(screen.getByLabelText('E-pošta'), 'ana@example.si');
    await userEvent.type(screen.getByLabelText('Geslo'), 'geslo123');
    await userEvent.click(screen.getByRole('button', { name: 'Prijava' }));
    expect(auth.signIn).toHaveBeenCalledWith('ana@example.si', 'geslo123');
  });

  it('signs up with name, email and password', async () => {
    const auth = fakeAuth(null);
    renderApp('/', fakeApi(), auth);
    await userEvent.click(screen.getByRole('button', { name: 'Registracija' }));
    await userEvent.type(screen.getByLabelText('Ime in priimek'), 'Ana Kos');
    await userEvent.type(screen.getByLabelText('E-pošta'), 'ana@example.si');
    await userEvent.type(screen.getByLabelText('Geslo'), 'geslo123');
    await userEvent.click(screen.getByRole('button', { name: 'Registracija' }));
    expect(auth.signUp).toHaveBeenCalledWith('ana@example.si', 'geslo123', 'Ana Kos');
  });

  it('after sign-out the page shows the sign-in page', async () => {
    const api = fakeApi({ listWorkspaces: vi.fn(async () => [workspace()]) });
    renderApp('/', api);
    expect(await screen.findByRole('link', { name: 'Projekt' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Odjava' }));
    expect(screen.getByRole('heading', { name: 'Prijava' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projekt' })).not.toBeInTheDocument();
  });
});

describe('AC-002 Workspaces', () => {
  it('lists the Workspaces with the Role', async () => {
    const api = fakeApi({ listWorkspaces: vi.fn(async () => [workspace('VIEWER', 'Bralni')]) });
    renderApp('/', api);
    expect(await screen.findByRole('link', { name: 'Bralni' })).toBeInTheDocument();
    expect(screen.getByText('Bralec')).toBeInTheDocument();
  });

  it('creates a Workspace and refuses an empty name without calling the API', async () => {
    const createWorkspace = vi.fn(async () => workspace());
    const api = fakeApi({ createWorkspace });
    renderApp('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Ustvari' }));
    expect(screen.getByText('Polje je obvezno.')).toBeInTheDocument();
    expect(createWorkspace).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Ime'), 'Nov projekt');
    await userEvent.click(screen.getByRole('button', { name: 'Ustvari' }));
    expect(createWorkspace).toHaveBeenCalledWith('Nov projekt');
  });

  it('shows the API field error next to the name', async () => {
    const api = fakeApi({
      createWorkspace: vi.fn(async () => {
        throw new ApiError(400, [{ field: 'name', message: 'at most 100 characters' }]);
      }),
    });
    renderApp('/', api);
    await userEvent.type(await screen.findByLabelText('Ime'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Ustvari' }));
    expect(await screen.findByText('Največ 100 znakov.')).toBeInTheDocument();
  });

  it('an Owner renames the Workspace in the settings', async () => {
    const renameWorkspace = vi.fn(async () => workspace('OWNER', 'Novo'));
    const api = fakeApi({ getWorkspace: vi.fn(async () => workspace()), renameWorkspace });
    renderApp('/w/w1/nastavitve', api);
    const input = await screen.findByLabelText('Ime delovnega prostora');
    await userEvent.clear(input);
    await userEvent.type(input, 'Novo');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(renameWorkspace).toHaveBeenCalledWith('w1', 'Novo'));
  });

  it('a non-Member sees the not-found page', async () => {
    const api = fakeApi({
      getWorkspace: vi.fn(async () => {
        throw new ApiError(404, [{ field: null, message: 'not found' }]);
      }),
    });
    renderApp('/w/w1', api);
    expect(await screen.findByRole('heading', { name: 'Ni najdeno' })).toBeInTheDocument();
  });
});

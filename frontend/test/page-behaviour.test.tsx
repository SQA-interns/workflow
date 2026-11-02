import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../src/lib/api';
import { USER, contact, fakeApi, fakeAuth, renderApp, workspace } from './helpers';

const fail = (status: number, field: string | null = null, message = 'x') =>
  vi.fn(async () => {
    throw new ApiError(status, [{ field, message }]);
  });

function api(role: 'OWNER' | 'EDITOR' | 'VIEWER', over: Partial<Api> = {}) {
  return fakeApi({ getWorkspace: vi.fn(async () => workspace(role)), ...over });
}

describe('Sign-in page errors', () => {
  it('asks for an email and a password of at least 6 characters before trying', async () => {
    const auth = fakeAuth(null);
    renderApp('/', fakeApi(), auth);
    await userEvent.type(screen.getByLabelText('E-pošta'), 'a@b.si');
    await userEvent.type(screen.getByLabelText('Geslo'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Prijava' }));
    expect(screen.getByRole('alert')).toHaveTextContent('vsaj 6 znaki');
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('reports failed sign-in, sign-up and Google sign-in', async () => {
    const auth = fakeAuth(null);
    auth.signIn = vi.fn(async () => Promise.reject(new Error('no')));
    auth.signUp = vi.fn(async () => Promise.reject(new Error('no')));
    auth.signInWithGoogle = vi.fn(async () => Promise.reject(new Error('no')));
    renderApp('/', fakeApi(), auth);
    await userEvent.type(screen.getByLabelText('E-pošta'), 'a@b.si');
    await userEvent.type(screen.getByLabelText('Geslo'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Prijava' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Prijava ni uspela');
    await userEvent.click(screen.getByRole('button', { name: 'Prijava z Googlom' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Prijava z Googlom ni uspela');
    await userEvent.click(screen.getByRole('button', { name: 'Registracija' }));
    await userEvent.click(screen.getByRole('button', { name: 'Registracija' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Registracija ni uspela');
    await userEvent.click(screen.getByRole('button', { name: 'Prijava' }));
    expect(screen.getByRole('heading', { name: 'Prijava' })).toBeInTheDocument();
  });

  it('signs in with Google', async () => {
    const auth = fakeAuth(null);
    renderApp('/', fakeApi(), auth);
    await userEvent.click(screen.getByRole('button', { name: 'Prijava z Googlom' }));
    expect(auth.signInWithGoogle).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the loading state until the sign-in state is known and the email when there is no name', async () => {
    const auth = fakeAuth({ ...USER, displayName: null });
    renderApp('/', fakeApi(), auth);
    expect(await screen.findByText('ana@example.si')).toBeInTheDocument();
  });
});

describe('Workspace pages errors', () => {
  it('shows a failed Workspace list and a failed Workspace', async () => {
    const { unmount } = renderApp('/', fakeApi({ listWorkspaces: fail(500) }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Neveljavna vrednost.');
    unmount();
    renderApp('/w/w1', fakeApi({ getWorkspace: fail(403) }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nimate pravic');
  });

  it('rejects an over-long Workspace name before sending and shows API errors without a field', async () => {
    const createWorkspace = fail(429);
    renderApp('/', fakeApi({ createWorkspace }));
    await userEvent.type(await screen.findByLabelText('Ime'), 'x'.repeat(101));
    await userEvent.click(screen.getByRole('button', { name: 'Ustvari' }));
    expect(screen.getByText('Največ 100 znakov.')).toBeInTheDocument();
    expect(createWorkspace).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Ime'));
    await userEvent.type(screen.getByLabelText('Ime'), 'Ok');
    await userEvent.click(screen.getByRole('button', { name: 'Ustvari' }));
    expect(await screen.findByText(/Preveč zahtev/)).toBeInTheDocument();
  });

  it('settings: empty name, API rename error and API delete error', async () => {
    renderApp('/w/w1/nastavitve', api('OWNER', { renameWorkspace: fail(400, 'name', 'required'), deleteWorkspace: fail(400, 'confirmName', 'must equal the Workspace name exactly') }));
    const name = await screen.findByLabelText('Ime delovnega prostora');
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(name).toHaveAccessibleDescription('Polje je obvezno.');
    await userEvent.type(name, 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(name).toHaveAccessibleDescription('Polje je obvezno.'));
    await userEvent.type(screen.getByLabelText('Ime za potrditev'), 'Projekt');
    await userEvent.click(screen.getByRole('button', { name: 'Trajno izbriši' }));
    await waitFor(() => expect(screen.getByLabelText('Ime za potrditev')).toHaveAccessibleDescription(/ne ujema/));
  });
});

describe('Tags page errors', () => {
  const tags = vi.fn(async () => [{ name: 'vip', count: 1 }]);

  it('refuses a name with a space, cancels rename and delete, and shows a delete error', async () => {
    const renameTag = vi.fn();
    renderApp('/w/w1/oznake', api('EDITOR', { listTags: tags, renameTag, deleteTag: fail(403) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Preimenuj vip' }));
    const input = screen.getByLabelText('Novo ime za vip');
    await userEvent.clear(input);
    await userEvent.type(input, 'ima presledek');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani ime' }));
    expect(input).toHaveAccessibleDescription(/ne sme vsebovati presledkov/);
    expect(renameTag).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Prekliči' }));
    await userEvent.click(screen.getByRole('button', { name: 'Izbriši vip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Prekliči' }));
    await userEvent.click(screen.getByRole('button', { name: 'Izbriši vip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi izbris vip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nimate pravic');
  });

  it('renames successfully and shows an empty list and a list error', async () => {
    const renameTag = vi.fn(async () => ({ name: 'VIP', count: 1 }));
    const { unmount } = renderApp('/w/w1/oznake', api('EDITOR', { listTags: tags, renameTag }));
    await userEvent.click(await screen.findByRole('button', { name: 'Preimenuj vip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Shrani ime' }));
    await waitFor(() => expect(renameTag).toHaveBeenCalledWith('w1', 'vip', 'vip'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Shrani ime' })).not.toBeInTheDocument());
    unmount();
    const r2 = renderApp('/w/w1/oznake', api('VIEWER'));
    expect(await screen.findByText('V tem delovnem prostoru še ni oznak.')).toBeInTheDocument();
    r2.unmount();
    renderApp('/w/w1/oznake', api('VIEWER', { listTags: fail(500) }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Members page errors', () => {
  const members = vi.fn(async () => ({
    members: [{ userId: 'u1', email: 'ana@example.si', displayName: null, role: 'OWNER' as const }],
    invitations: [],
  }));

  it('checks the email before sending and shows API errors with or without a field', async () => {
    const addMember = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, [{ field: 'email', message: 'already a member or invited' }]))
      .mockRejectedValueOnce(new ApiError(500, []))
      .mockResolvedValueOnce({ status: 'MEMBER' });
    renderApp('/w/w1/clani', api('OWNER', { listMembers: members, addMember }));
    const email = await screen.findByLabelText('E-pošta člana');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(email).toHaveAccessibleDescription('Polje je obvezno.');
    await userEvent.type(email, 'ni-email');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(email).toHaveAccessibleDescription('Vnesite veljaven e-poštni naslov.');
    await userEvent.clear(email);
    await userEvent.type(email, 'bor@example.si');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    await waitFor(() => expect(email).toHaveAccessibleDescription('Ta oseba je že član ali je že povabljena.'));
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    await waitFor(() => expect(email).toHaveAccessibleDescription('Prišlo je do napake.'));
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(await screen.findByText('Član je dodan.')).toBeInTheDocument();
  });

  it('the last Owner leaving shows the refusal; a list error is shown', async () => {
    const removeMember = fail(409, null, 'a workspace needs an owner');
    const { unmount } = renderApp('/w/w1/clani', api('OWNER', { listMembers: members, removeMember }));
    await userEvent.click(await screen.findByRole('button', { name: 'Zapusti delovni prostor' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('vsaj enega lastnika');
    unmount();
    renderApp('/w/w1/clani', api('OWNER', { listMembers: fail(500) }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('a Member who leaves returns to the Workspace list', async () => {
    const removeMember = vi.fn(async () => {});
    renderApp('/w/w1/clani', api('VIEWER', { listMembers: members, removeMember }));
    await userEvent.click(await screen.findByRole('button', { name: 'Zapusti delovni prostor' }));
    expect(removeMember).toHaveBeenCalledWith('w1', 'u1');
    expect(await screen.findByRole('heading', { name: 'Delovni prostori' })).toBeInTheDocument();
  });
});

describe('Contact page and form errors', () => {
  it('shows a failed delete, the merged-into link, an empty Contact and a cancelled purge', async () => {
    const getContact = vi.fn(async () => contact({ deleted: true, mergedInto: 'c9' }));
    const { unmount } = renderApp('/w/w1/kontakti/c1', api('OWNER', { getContact }));
    expect(await screen.findByRole('link', { name: 'ohranjeni kontakt' })).toHaveAttribute('href', '/w/w1/kontakti/c9');
    await userEvent.click(screen.getByRole('button', { name: 'Trajno izbriši' }));
    await userEvent.click(screen.getByRole('button', { name: 'Prekliči' }));
    expect(screen.queryByRole('button', { name: 'Potrdi trajni izbris' })).not.toBeInTheDocument();
    unmount();
    renderApp(
      '/w/w1/kontakti/c1',
      api('EDITOR', {
        getContact: vi.fn(async () =>
          contact({ firstName: null, lastName: null, email: null, attributes: [{ key: 'k', value: 'v' }], tags: ['t'] }),
        ),
        deleteContact: fail(409, 'version', 'outdated version'),
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Brez imena' })).toBeInTheDocument();
    expect(screen.getByText('v')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Izbriši' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nekdo drug');
  });

  it('shows a Contact that failed to load and its not-found page', async () => {
    const { unmount } = renderApp('/w/w1/kontakti/c1', api('VIEWER', { getContact: fail(500) }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    unmount();
    renderApp('/w/w1/kontakti/c1', api('VIEWER', { getContact: fail(404) }));
    expect(await screen.findByRole('heading', { name: 'Ni najdeno' })).toBeInTheDocument();
  });

  it('the form: load error, Viewer refusal and a Restore conflict on the history page', async () => {
    const { unmount } = renderApp('/w/w1/kontakti/c1/uredi', api('EDITOR', { getContact: fail(500) }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    unmount();
    const r2 = renderApp('/w/w1/kontakti/nov', api('VIEWER'));
    expect(await screen.findByText('Za urejanje kontaktov nimate pravic.')).toBeInTheDocument();
    r2.unmount();
    renderApp(
      '/w/w1/kontakti/c1/zgodovina',
      api('EDITOR', {
        getContact: vi.fn(async () => contact({ version: 2 })),
        listRevisions: vi.fn(async () => [
          { number: 1, type: 'CREATE' as const, author: { id: 'u', email: 'a@b.si', displayName: null }, createdAt: '2026-01-01T00:00:00Z', state: { ...contact(), deleted: false, mergedInto: null } },
        ]),
        restoreRevision: fail(409, 'version', 'outdated version'),
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Obnovi revizijo 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nekdo drug');
    expect(screen.getByText(/a@b\.si/)).toBeInTheDocument();
  });

  it('the history page shows a load error and a not-found page', async () => {
    const { unmount } = renderApp('/w/w1/kontakti/c1/zgodovina', api('VIEWER', { getContact: fail(500) }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    unmount();
    renderApp('/w/w1/kontakti/c1/zgodovina', api('VIEWER', { getContact: fail(404) }));
    expect(await screen.findByRole('heading', { name: 'Ni najdeno' })).toBeInTheDocument();
  });
});

describe('Contact list errors and paging', () => {
  it('shows a list error, an Export error, clears the selection and pages back', async () => {
    const listContacts = vi.fn(async () => ({ items: [contact()], total: 45, page: 1, size: 20 }));
    const { unmount } = renderApp('/w/w1?page=1', api('VIEWER', { listContacts, exportContacts: fail(400, 'contactIds', 'invalid selection') }));
    expect(await screen.findByText('Stran 2 od 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Izberi Saša Novak' }));
    await userEvent.click(screen.getByRole('button', { name: 'Izvozi izbrane (1)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Neveljaven izbor kontaktov.');
    await userEvent.click(screen.getByRole('button', { name: 'Počisti izbor' }));
    expect(screen.getByRole('button', { name: 'Izvozi vse najdene (45)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Izberi vse na strani' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Izberi vse na strani' }));
    expect(screen.getByRole('checkbox', { name: 'Izberi Saša Novak' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Izberi Saša Novak' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Izberi Saša Novak' }));
    expect(screen.getByRole('checkbox', { name: 'Izberi Saša Novak' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Prejšnja stran' }));
    await waitFor(() => expect((listContacts.mock.calls.at(-1) as unknown[])[1]).toMatchObject({ page: 0 }));
    unmount();
    renderApp('/w/w1', api('VIEWER', { listContacts: fail(500) }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows the empty Deleted view and the direction choice', async () => {
    const listContacts = vi.fn(async () => ({ items: [], total: 0, page: 0, size: 20 }));
    renderApp('/w/w1/izbrisani', api('VIEWER', { listContacts }));
    expect(await screen.findByText('Ni izbrisanih kontaktov.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Smer'), 'desc');
    await waitFor(() => expect((listContacts.mock.calls.at(-1) as unknown[])[1]).toMatchObject({ dir: 'desc', deleted: true }));
    await userEvent.selectOptions(screen.getByLabelText('Smer'), 'asc');
    await waitFor(() => expect((listContacts.mock.calls.at(-1) as unknown[])[1]).toMatchObject({ dir: 'asc' }));
    await userEvent.selectOptions(screen.getByLabelText('Razvrsti po'), 'lastName');
    await userEvent.selectOptions(screen.getByLabelText('Smer'), '');
    await waitFor(() => expect((listContacts.mock.calls.at(-1) as unknown[])[1]).toMatchObject({ dir: undefined }));
  });
});

describe('Duplicates page', () => {
  it('shows an empty page and a load error', async () => {
    const { unmount } = renderApp('/w/w1/dvojniki', api('EDITOR'));
    expect(await screen.findByText('Ni najdenih dvojnikov.')).toBeInTheDocument();
    unmount();
    renderApp('/w/w1/dvojniki', api('EDITOR', { listDuplicateSets: fail(500) }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('cancels the merge dialog', async () => {
    const a = contact({ id: 'a' });
    const b = contact({ id: 'b', firstName: 'Sasa' });
    renderApp('/w/w1/dvojniki', api('EDITOR', { listDuplicateSets: vi.fn(async () => [{ contacts: [a, b], matches: [] }]) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Združi skupino 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Združi kontakte' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Prekliči' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

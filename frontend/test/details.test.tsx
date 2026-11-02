import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../src/lib/api';
import { Alert } from '../src/components/Alert';
import { DuplicateWarning } from '../src/components/DuplicateWarning';
import { FormField } from '../src/components/FormField';
import { useWorkspace } from '../src/pages/WorkspaceLayout';
import { USER, fakeApi, fakeAuth, renderApp, workspace } from './helpers';

const fail = (status: number, field: string | null = null, message = 'x') =>
  vi.fn(async () => {
    throw new ApiError(status, [{ field, message }]);
  });
function api(role: 'OWNER' | 'EDITOR' | 'VIEWER', over: Partial<Api> = {}) {
  return fakeApi({ getWorkspace: vi.fn(async () => workspace(role)), ...over });
}
afterEach(() => vi.restoreAllMocks());

describe('small components', () => {
  it('Alert: errors are alerts, other kinds are status messages with their class', () => {
    render(
      <>
        <Alert>napaka</Alert>
        <Alert kind="info">info</Alert>
        <Alert kind="warning">pozor</Alert>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('napaka');
    expect(screen.getByRole('alert')).toHaveClass('alert', 'alert-error');
    expect(screen.getAllByRole('status').map((e) => e.className)).toEqual(['alert alert-info', 'alert alert-warning']);
  });

  it('FormField: marks an invalid field and describes it with the error', () => {
    const { rerender } = render(<FormField label="Ime" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Ime')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Ime').closest('div')).toHaveClass('field');
    expect(screen.getByLabelText('Ime').closest('div')).not.toHaveClass('has-error');
    rerender(<FormField label="Ime" value="" error="Napaka" onChange={() => {}} />);
    expect(screen.getByLabelText('Ime')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Ime').closest('div')).toHaveClass('field', 'has-error');
    expect(screen.getByLabelText('Ime')).toHaveAccessibleDescription('Napaka');
  });

  it('DuplicateWarning: nothing without duplicates; names, email fallback and every match kind', () => {
    const { container } = render(<MemoryRouter><DuplicateWarning wid="w1" duplicates={[]} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
    render(
      <MemoryRouter>
        <DuplicateWarning
          wid="w1"
          duplicates={[
            { id: 'a', firstName: 'Ana', lastName: null, email: null, phone: null, matchKinds: ['PHONE'] },
            { id: 'b', firstName: null, lastName: null, email: 'b@x.si', phone: null, matchKinds: ['EMAIL', 'NAME'] },
            { id: 'c', firstName: null, lastName: null, email: null, phone: '041', matchKinds: ['PHONE'] },
          ]}
        />
      </MemoryRouter>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/^Ana \(ujema se: telefon\)$/);
    expect(items[1]).toHaveTextContent(/^b@x\.si \(ujema se: e-pošta, ime in priimek\)$/);
    expect(items[2]).toHaveTextContent(/^Kontakt \(ujema se: telefon\)$/);
  });

  it('useWorkspace fails outside a Workspace', () => {
    function Probe() {
      useWorkspace();
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('outside workspace');
    spy.mockRestore();
  });
});

describe('App and header', () => {
  it('shows a loading state until the sign-in state is known, and the display name', async () => {
    const auth = fakeAuth(USER);
    let emit: (u: typeof USER | null) => void = () => {};
    auth.onChange = (l) => {
      emit = l;
      return () => {};
    };
    renderApp('/', fakeApi(), auth);
    expect(screen.getByRole('status')).toHaveTextContent('Nalaganje');
    emit(USER);
    expect(await screen.findByText('Ana')).toHaveClass('who');
    emit(null);
    expect(await screen.findByRole('heading', { name: 'Prijava' })).toBeInTheDocument();
  });

  it('keeps one subscription to the sign-in state', async () => {
    const auth = fakeAuth(USER);
    const onChange = vi.spyOn(auth, 'onChange');
    const { rerender } = renderApp('/', fakeApi(), auth);
    await screen.findByRole('heading', { name: 'Delovni prostori' });
    rerender(<MemoryRouter><div /></MemoryRouter>);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('Workspace navigation', () => {
  it('links every section; Settings only for Owners', async () => {
    const { unmount } = renderApp('/w/w1', api('OWNER'));
    const nav = await screen.findByRole('navigation', { name: 'Delovni prostor' });
    const links = within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Kontakti', '/w/w1'],
      ['Izbrisani kontakti', '/w/w1/izbrisani'],
      ['Oznake', '/w/w1/oznake'],
      ['Dvojniki', '/w/w1/dvojniki'],
      ['Člani', '/w/w1/clani'],
      ['Nastavitve', '/w/w1/nastavitve'],
    ]);
    expect(within(nav).getByText('Lastnik')).toBeInTheDocument();
    unmount();
    renderApp('/w/w1', api('EDITOR'));
    const nav2 = await screen.findByRole('navigation', { name: 'Delovni prostor' });
    expect(within(nav2).queryByRole('link', { name: 'Nastavitve' })).not.toBeInTheDocument();
  });

  it('the Workspace list links each Workspace and hides the empty note when there are some', async () => {
    renderApp('/', fakeApi({ listWorkspaces: vi.fn(async () => [workspace('EDITOR', 'Prvi')]) }));
    expect(await screen.findByRole('link', { name: 'Prvi' })).toHaveAttribute('href', '/w/w1');
    expect(screen.getByText('Urednik')).toBeInTheDocument();
    expect(screen.queryByText('Še niste član nobenega delovnega prostora.')).not.toBeInTheDocument();
  });

  it('the empty Workspace list explains itself; creating trims, clears the field and reloads', async () => {
    const listWorkspaces = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([workspace('OWNER', 'Nov')]);
    const createWorkspace = vi.fn(async () => workspace('OWNER', 'Nov'));
    renderApp('/', fakeApi({ listWorkspaces, createWorkspace }));
    expect(await screen.findByText('Še niste član nobenega delovnega prostora.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Ime'), '  Nov  ');
    await userEvent.click(screen.getByRole('button', { name: 'Ustvari' }));
    await waitFor(() => expect(createWorkspace).toHaveBeenCalledWith('Nov'));
    expect(await screen.findByRole('link', { name: 'Nov' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ime')).toHaveValue('');
    expect(screen.getByLabelText('Ime')).not.toHaveAccessibleDescription();
    await userEvent.type(screen.getByLabelText('Ime'), 'x'.repeat(100));
    await userEvent.click(screen.getByRole('button', { name: 'Ustvari' }));
    await waitFor(() => expect(createWorkspace).toHaveBeenCalledWith('x'.repeat(100)));
  });
});

describe('Workspace settings', () => {
  it('starts without a saved note, trims the name, says saved, and clears the error', async () => {
    const renameWorkspace = vi.fn().mockRejectedValueOnce(new ApiError(500, [])).mockResolvedValue(workspace('OWNER', 'Novo'));
    renderApp('/w/w1/nastavitve', api('OWNER', { renameWorkspace }));
    const name = await screen.findByLabelText('Ime delovnega prostora');
    expect(screen.queryByText('Shranjeno.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ime za potrditev')).toHaveValue('');
    await userEvent.clear(name);
    await userEvent.type(name, '  Novo ');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(name).toHaveAccessibleDescription('Prišlo je do napake.'));
    expect(screen.queryByText('Shranjeno.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(await screen.findByText('Shranjeno.')).toBeInTheDocument();
    expect(renameWorkspace).toHaveBeenLastCalledWith('w1', 'Novo');
    expect(name).not.toHaveAccessibleDescription();
    await userEvent.clear(name);
    await userEvent.type(name, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(name).toHaveAccessibleDescription('Polje je obvezno.');
    expect(screen.queryByText('Shranjeno.')).not.toBeInTheDocument();
  });

  it('shows a delete error without a field', async () => {
    renderApp('/w/w1/nastavitve', api('OWNER', { deleteWorkspace: fail(403) }));
    await userEvent.type(await screen.findByLabelText('Ime za potrditev'), 'Projekt');
    await userEvent.click(screen.getByRole('button', { name: 'Trajno izbriši' }));
    await waitFor(() => expect(screen.getByLabelText('Ime za potrditev')).toHaveAccessibleDescription('Za to dejanje nimate pravic.'));
  });
});

describe('Sign-in page details', () => {
  it('switches between sign-in and sign-up texts and password autocomplete', async () => {
    const auth = fakeAuth(null);
    renderApp('/', fakeApi(), auth);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Prijava$/);
    expect(screen.getByText(/Še nimate računa\?/)).toBeInTheDocument();
    expect(screen.getByLabelText('Geslo')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.queryByLabelText('Ime in priimek')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Registracija' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Registracija$/);
    expect(screen.getByText(/Že imate račun\?/)).toBeInTheDocument();
    expect(screen.getByLabelText('Geslo')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('trims email and name, refuses a blank email, and disables the button while signing in', async () => {
    const auth = fakeAuth(null);
    let done: () => void = () => {};
    auth.signIn = vi.fn(() => new Promise<void>((r) => (done = r)));
    renderApp('/', fakeApi(), auth);
    await userEvent.type(screen.getByLabelText('E-pošta'), '   ');
    await userEvent.type(screen.getByLabelText('Geslo'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Prijava' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('E-pošta'), ' a@b.si ');
    await userEvent.click(screen.getByRole('button', { name: 'Prijava' }));
    expect(auth.signIn).toHaveBeenCalledWith('a@b.si', '123456');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prijava' })).toBeDisabled();
    done();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Prijava' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Registracija' }));
    await userEvent.type(screen.getByLabelText('Ime in priimek'), '  Ana Kos ');
    await userEvent.click(screen.getByRole('button', { name: 'Registracija' }));
    expect(auth.signUp).toHaveBeenCalledWith('a@b.si', '123456', 'Ana Kos');
  });

  it('a new attempt clears the previous error', async () => {
    const auth = fakeAuth(null);
    auth.signIn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    auth.signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    renderApp('/', fakeApi(), auth);
    await userEvent.type(screen.getByLabelText('E-pošta'), 'a@b.si');
    await userEvent.type(screen.getByLabelText('Geslo'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Prijava' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Prijava z Googlom' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('Members page details', () => {
  const members = {
    members: [
      { userId: 'u1', email: 'ana@example.si', displayName: null, role: 'OWNER' as const },
      { userId: 'u2', email: null, displayName: 'Bor', role: 'VIEWER' as const },
    ],
    invitations: [{ id: 'i1', email: 'nova@x.si', role: 'EDITOR' as const, createdAt: '' }],
  };

  it('shows "—" without a name, names the role select by email or name, and offers every Role', async () => {
    renderApp('/w/w1/clani', api('OWNER', { listMembers: vi.fn(async () => members) }));
    const own = (await screen.findByText('ana@example.si')).closest('tr')!;
    expect(own).toHaveTextContent(/^—ana@example\.si/);
    expect(screen.getByLabelText('Vloga za ana@example.si')).toHaveValue('OWNER');
    expect(screen.getByLabelText('Vloga za Bor')).toHaveValue('VIEWER');
    expect(within(screen.getByLabelText('Vloga za Bor')).getAllByRole('option').map((o) => [o.getAttribute('value'), o.textContent])).toEqual([
      ['OWNER', 'Lastnik'],
      ['EDITOR', 'Urednik'],
      ['VIEWER', 'Bralec'],
    ]);
    expect(screen.getByLabelText('Vloga')).toHaveValue('VIEWER');
    expect(within(own).getByRole('button', { name: 'Zapusti delovni prostor' })).toBeInTheDocument();
    expect(screen.queryByText('Ni čakajočih povabil.')).not.toBeInTheDocument();
    expect(screen.getByText('nova@x.si').closest('li')).toHaveTextContent(/^nova@x\.si Urednik Prekliči povabilo$/);
  });

  it('without invitations says so and shows no invitation list', async () => {
    renderApp('/w/w1/clani', api('VIEWER', { listMembers: vi.fn(async () => ({ members: members.members, invitations: [] })) }));
    expect(await screen.findByText('Ni čakajočih povabil.')).toBeInTheDocument();
    expect(screen.getByRole('main').querySelector('ul.cards')).toBeNull();
  });

  it('adding trims the email, clears the form and the old message and errors; a failed action is shown once', async () => {
    const addMember = vi.fn(async () => ({ status: 'INVITED' as const }));
    const changeRole = vi.fn().mockRejectedValueOnce(new ApiError(409, [{ field: 'role', message: 'a workspace needs an owner' }])).mockResolvedValue(members.members[0]);
    renderApp('/w/w1/clani', api('OWNER', { listMembers: vi.fn(async () => members), addMember, changeRole }));
    const email = await screen.findByLabelText('E-pošta člana');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(email).toHaveAccessibleDescription('Polje je obvezno.');
    await userEvent.type(email, '  cene@x.si  ');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    await waitFor(() => expect(addMember).toHaveBeenCalledWith('w1', 'cene@x.si', 'VIEWER'));
    expect(await screen.findByText(/Povabilo je ustvarjeno/)).toBeInTheDocument();
    expect(email).toHaveValue('');
    expect(email).not.toHaveAccessibleDescription();
    await userEvent.type(email, 'x@y.si x');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(screen.queryByText(/Povabilo je ustvarjeno/)).not.toBeInTheDocument();
    expect(email).toHaveAccessibleDescription('Vnesite veljaven e-poštni naslov.');
    await userEvent.selectOptions(screen.getByLabelText('Vloga za ana@example.si'), 'EDITOR');
    expect(await screen.findByRole('alert')).toHaveTextContent('vsaj enega lastnika');
    await userEvent.selectOptions(screen.getByLabelText('Vloga za ana@example.si'), 'EDITOR');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('an added Member gets "Član je dodan."', async () => {
    renderApp('/w/w1/clani', api('OWNER', { listMembers: vi.fn(async () => members), addMember: vi.fn(async () => ({ status: 'MEMBER' as const })) }));
    await userEvent.type(await screen.findByLabelText('E-pošta člana'), 'b@x.si');
    await userEvent.selectOptions(screen.getByLabelText('Vloga'), 'OWNER');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(await screen.findByText('Član je dodan.')).toBeInTheDocument();
  });
});

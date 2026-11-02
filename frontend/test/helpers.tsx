import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../src/App';
import type { Api, Contact, Workspace } from '../src/lib/api';
import type { AuthService, AuthUser } from '../src/lib/auth';

export const USER: AuthUser = { uid: 'u1', email: 'ana@example.si', displayName: 'Ana', emailVerified: true };

export function fakeAuth(initial: AuthUser | null = USER) {
  let listener: (u: AuthUser | null) => void = () => {};
  const auth: AuthService & { emit: (u: AuthUser | null) => void } = {
    onChange: (l) => {
      listener = l;
      l(initial);
      return () => {};
    },
    signIn: vi.fn(async () => {}),
    signUp: vi.fn(async () => {}),
    signInWithGoogle: vi.fn(async () => {}),
    signOut: vi.fn(async () => listener(null)),
    token: async () => 'token',
    emit: (u) => listener(u),
  };
  return auth;
}

const reject = () => vi.fn(async () => Promise.reject(new Error('not faked')));

export function fakeApi(overrides: Partial<Api> = {}): Api {
  const base: Api = {
    me: vi.fn(async () => ({ id: 'u1', email: USER.email, emailVerified: true, displayName: 'Ana' })),
    listWorkspaces: vi.fn(async () => []),
    createWorkspace: reject(),
    getWorkspace: reject(),
    renameWorkspace: reject(),
    deleteWorkspace: reject(),
    listMembers: vi.fn(async () => ({ members: [], invitations: [] })),
    addMember: reject(),
    changeRole: reject(),
    removeMember: reject(),
    cancelInvitation: reject(),
    listContacts: vi.fn(async () => ({ items: [], total: 0, page: 0, size: 20 })),
    getContact: reject(),
    createContact: reject(),
    updateContact: reject(),
    deleteContact: reject(),
    restoreContact: reject(),
    purgeContact: reject(),
    listRevisions: vi.fn(async () => []),
    restoreRevision: reject(),
    listTags: vi.fn(async () => []),
    renameTag: reject(),
    deleteTag: reject(),
    listDuplicateSets: vi.fn(async () => []),
    merge: reject(),
    exportContacts: reject(),
  };
  return { ...base, ...overrides };
}

export function workspace(role: Workspace['role'] = 'OWNER', name = 'Projekt'): Workspace {
  return { id: 'w1', name, role };
}

export function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    version: 1,
    deleted: false,
    mergedInto: null,
    firstName: 'Saša',
    lastName: 'Novak',
    email: 'sasa@example.si',
    phone: null,
    company: null,
    jobTitle: null,
    street: null,
    postalCode: null,
    city: null,
    country: null,
    note: null,
    attributes: [],
    tags: [],
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    ...over,
  };
}

export function renderApp(path: string, api: Api, auth = fakeAuth()) {
  return {
    auth,
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <App api={api} auth={auth} />
      </MemoryRouter>,
    ),
  };
}

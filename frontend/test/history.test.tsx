import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Api, ContactState, Revision } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

function state(over: Partial<ContactState> = {}): ContactState {
  const { id: _i, version: _v, createdAt: _c, updatedAt: _u, ...rest } = contact();
  void _i;
  void _v;
  void _c;
  void _u;
  return { ...rest, ...over };
}

const author = { id: 'u1', email: 'ana@example.si', displayName: 'Ana' };
const revisions: Revision[] = [
  {
    number: 2,
    type: 'UPDATE',
    author,
    createdAt: '2026-01-02T10:00:00Z',
    state: state({ lastName: 'Kos', tags: ['nova'], attributes: [{ key: 'kompetenca', value: 'web' }] }),
  },
  { number: 1, type: 'CREATE', author, createdAt: '2026-01-01T10:00:00Z', state: state({ tags: ['stara'] }) },
];

function api(role: 'OWNER' | 'EDITOR' | 'VIEWER', over: Partial<Api> = {}) {
  return fakeApi({
    getWorkspace: vi.fn(async () => workspace(role)),
    getContact: vi.fn(async () => contact({ version: 2, lastName: 'Kos' })),
    listRevisions: vi.fn(async () => revisions),
    ...over,
  });
}

describe('AC-009-06/07 history page', () => {
  it('shows every Revision with what changed, old and new', async () => {
    renderApp('/w/w1/kontakti/c1/zgodovina', api('VIEWER'));
    const rev2 = await screen.findByRole('listitem', { name: 'Revizija 2' });
    expect(within(rev2).getByRole('heading')).toHaveTextContent('Revizija 2: Spremenjen');
    const lastName = within(rev2).getByRole('row', { name: /Priimek/ });
    expect(lastName).toHaveTextContent('Novak');
    expect(lastName).toHaveTextContent('Kos');
    expect(within(rev2).getByRole('row', { name: /Atribut kompetenca/ })).toHaveTextContent('web');
    expect(within(rev2).getByRole('row', { name: /Oznaka.*nova/ })).toBeInTheDocument();
    expect(within(rev2).getByRole('row', { name: /Oznaka.*stara/ })).toBeInTheDocument();
    expect(within(rev2).queryByRole('row', { name: /^Ime/ })).not.toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Revizija 1' })).toHaveTextContent('Ana');
  });

  it('hides Restore from Viewers', async () => {
    renderApp('/w/w1/kontakti/c1/zgodovina', api('VIEWER'));
    await screen.findByRole('listitem', { name: 'Revizija 1' });
    expect(screen.queryByRole('button', { name: /Obnovi/ })).not.toBeInTheDocument();
  });

  it('an Editor restores an earlier Revision with the current version', async () => {
    const restoreRevision = vi.fn(async () => contact({ version: 3 }));
    renderApp('/w/w1/kontakti/c1/zgodovina', api('EDITOR', { restoreRevision }));
    await userEvent.click(await screen.findByRole('button', { name: 'Obnovi revizijo 1' }));
    await waitFor(() => expect(restoreRevision).toHaveBeenCalledWith('w1', 'c1', 1, 2));
    expect(screen.queryByRole('button', { name: 'Obnovi revizijo 2' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Revizija 1 je obnovljena/)).toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../src/lib/api';
import { fakeApi, renderApp, workspace } from './helpers';

const members = {
  members: [
    { userId: 'u1', email: 'ana@example.si', displayName: 'Ana', role: 'OWNER' as const },
    { userId: 'u2', email: 'bor@example.si', displayName: 'Bor', role: 'VIEWER' as const },
  ],
  invitations: [{ id: 'i1', email: 'nova@example.si', role: 'EDITOR' as const, createdAt: '2026-01-01' }],
};

function api(role: 'OWNER' | 'EDITOR' | 'VIEWER', over: Partial<Api> = {}) {
  return fakeApi({ getWorkspace: vi.fn(async () => workspace(role)), listMembers: vi.fn(async () => members), ...over });
}

describe('Members page', () => {
  it('shows Members and pending invitations', async () => {
    renderApp('/w/w1/clani', api('VIEWER'));
    expect(await screen.findByText('bor@example.si')).toBeInTheDocument();
    expect(screen.getByText('nova@example.si')).toBeInTheDocument();
  });

  it('hides member management from Editors and Viewers, but lets them leave', async () => {
    for (const role of ['EDITOR', 'VIEWER'] as const) {
      const { unmount } = renderApp('/w/w1/clani', api(role));
      await screen.findByText('bor@example.si');
      expect(screen.queryByRole('button', { name: 'Dodaj' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Odstrani' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Prekliči povabilo' })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Nastavitve' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Zapusti delovni prostor' })).toBeInTheDocument();
      unmount();
    }
  });

  it('an Owner adds a Member by email with a Role', async () => {
    const addMember = vi.fn(async () => ({ status: 'INVITED' as const }));
    renderApp('/w/w1/clani', api('OWNER', { addMember }));
    await userEvent.type(await screen.findByLabelText('E-pošta člana'), 'cene@example.si');
    await userEvent.selectOptions(screen.getByLabelText('Vloga'), 'EDITOR');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(addMember).toHaveBeenCalledWith('w1', 'cene@example.si', 'EDITOR');
    expect(await screen.findByText(/Povabilo je ustvarjeno/)).toBeInTheDocument();
  });

  it('an Owner changes a Role, removes a Member and cancels an invitation', async () => {
    const changeRole = vi.fn(async () => members.members[1]);
    const removeMember = vi.fn(async () => {});
    const cancelInvitation = vi.fn(async () => {});
    renderApp('/w/w1/clani', api('OWNER', { changeRole, removeMember, cancelInvitation }));
    await userEvent.selectOptions(await screen.findByLabelText('Vloga za bor@example.si'), 'EDITOR');
    expect(changeRole).toHaveBeenCalledWith('w1', 'u2', 'EDITOR');
    const row = screen.getByText('bor@example.si').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Odstrani' }));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('w1', 'u2'));
    await userEvent.click(screen.getByRole('button', { name: 'Prekliči povabilo' }));
    await waitFor(() => expect(cancelInvitation).toHaveBeenCalledWith('w1', 'i1'));
  });
});

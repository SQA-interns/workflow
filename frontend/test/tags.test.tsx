import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

const tagList = [
  { name: 'neObvescaj', count: 2 },
  { name: 'udelezenec2025', count: 5 },
];

function api(role: 'OWNER' | 'EDITOR' | 'VIEWER', over: Partial<Api> = {}) {
  return fakeApi({ getWorkspace: vi.fn(async () => workspace(role)), listTags: vi.fn(async () => tagList), ...over });
}

describe('Tags page', () => {
  it('shows Tags with their Contact counts', async () => {
    renderApp('/w/w1/oznake', api('VIEWER'));
    const cell = await screen.findByRole('link', { name: 'udelezenec2025' });
    expect(cell.closest('tr')).toHaveTextContent('5');
  });

  it('hides rename and delete from Viewers', async () => {
    renderApp('/w/w1/oznake', api('VIEWER'));
    await screen.findByRole('link', { name: 'neObvescaj' });
    expect(screen.queryByRole('button', { name: /Preimenuj/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Izbriši/ })).not.toBeInTheDocument();
  });

  it('an Editor renames a Tag and sees a name conflict', async () => {
    const renameTag = vi.fn(async () => {
      throw new ApiError(409, [{ field: 'name', message: 'tag name taken' }]);
    });
    renderApp('/w/w1/oznake', api('EDITOR', { renameTag }));
    await userEvent.click(await screen.findByRole('button', { name: 'Preimenuj neObvescaj' }));
    const input = screen.getByLabelText('Novo ime za neObvescaj');
    await userEvent.clear(input);
    await userEvent.type(input, 'udelezenec2025');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani ime' }));
    expect(renameTag).toHaveBeenCalledWith('w1', 'neObvescaj', 'udelezenec2025');
    expect(await screen.findByText('Oznaka s tem imenom že obstaja.')).toBeInTheDocument();
  });

  it('an Editor deletes a Tag after confirming', async () => {
    const deleteTag = vi.fn(async () => {});
    renderApp('/w/w1/oznake', api('EDITOR', { deleteTag }));
    await userEvent.click(await screen.findByRole('button', { name: 'Izbriši neObvescaj' }));
    expect(deleteTag).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi izbris neObvescaj' }));
    await waitFor(() => expect(deleteTag).toHaveBeenCalledWith('w1', 'neObvescaj'));
  });
});

describe('Tags in the Contact form', () => {
  it('sends the typed Tags and refuses repeats before sending', async () => {
    const createContact = vi.fn(async () => ({ ...contact({ id: 'n' }), possibleDuplicates: [] }));
    renderApp('/w/w1/kontakti/nov', api('EDITOR', { createContact, getContact: vi.fn(async () => contact()) }));
    await userEvent.type(await screen.findByLabelText('Ime'), 'Ana');
    await userEvent.type(screen.getByLabelText('Oznake (ločene s presledkom)'), 'vip VIP');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(screen.getByLabelText('Oznake (ločene s presledkom)')).toHaveAccessibleDescription('Oznaka »VIP« se ponavlja.');
    expect(createContact).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Oznake (ločene s presledkom)'));
    await userEvent.type(screen.getByLabelText('Oznake (ločene s presledkom)'), 'neObvescaj udelezenec2025');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(createContact).toHaveBeenCalled());
    expect(((createContact.mock.calls[0] as unknown[])[1] as { tags: string[] }).tags).toEqual(['neObvescaj', 'udelezenec2025']);
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filenameOf } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

const items = [contact({ id: 'a' }), contact({ id: 'b', firstName: 'Bor', lastName: 'Kos' }), contact({ id: 'c', firstName: 'Cene', lastName: 'Cerar' })];
let downloads: string[] = [];

beforeEach(() => {
  downloads = [];
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});
afterEach(() => vi.restoreAllMocks());

function setup(role: 'OWNER' | 'EDITOR' | 'VIEWER' = 'VIEWER') {
  const exportContacts = vi.fn(async () => ({ blob: new Blob(['x']), filename: 'Projekt-2026-11-02.xlsx' }));
  const listContacts = vi.fn(async () => ({ items, total: 3, page: 0, size: 20 }));
  renderApp('/w/w1?q=sa', fakeApi({ getWorkspace: vi.fn(async () => workspace(role)), listContacts, exportContacts }));
  return exportContacts;
}

describe('AC-012-06/07 Export from the list', () => {
  it('a Viewer exports the selected Contacts and gets the named file', async () => {
    const exportContacts = setup('VIEWER');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Izberi Saša Novak' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Izberi Cene Cerar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Izvozi izbrane (2)' }));
    await waitFor(() => expect(exportContacts).toHaveBeenCalledWith('w1', { contactIds: ['a', 'c'] }));
    expect(downloads).toEqual(['Projekt-2026-11-02.xlsx']);
  });

  it('with nothing selected exports everything matching the current search and filters', async () => {
    const exportContacts = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Izvozi vse najdene (3)' }));
    await waitFor(() => expect(exportContacts).toHaveBeenCalledWith('w1', { filter: { q: 'sa' } }));
  });

  it('select all on the page selects every row', async () => {
    const exportContacts = setup();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Izberi vse na strani' }));
    await userEvent.click(screen.getByRole('button', { name: 'Izvozi izbrane (3)' }));
    await waitFor(() => expect(exportContacts).toHaveBeenCalledWith('w1', { contactIds: ['a', 'b', 'c'] }));
  });

  it('reads the UTF-8 file name', () => {
    expect(filenameOf(`attachment; filename="Skofja-2026-11-02.xlsx"; filename*=UTF-8''%C5%A0kofja-2026-11-02.xlsx`)).toBe('Škofja-2026-11-02.xlsx');
    expect(filenameOf('attachment; filename="a.xlsx"')).toBe('a.xlsx');
  });
});

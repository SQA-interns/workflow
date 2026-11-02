import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContactQuery } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

function lastQuery(fn: ReturnType<typeof vi.fn>): ContactQuery {
  return (fn.mock.calls.at(-1) as unknown[])[1] as ContactQuery;
}

describe('AC-008-08 Contact list', () => {
  it('filters without a reload and shows the total', async () => {
    const listContacts = vi.fn(async (_w: string, q: ContactQuery) =>
      q.q === 'sasa'
        ? { items: [contact()], total: 1, page: 0, size: 20 }
        : { items: [contact(), contact({ id: 'c2', firstName: 'Bor', lastName: 'Kos' })], total: 2, page: 0, size: 20 },
    );
    renderApp('/w/w1', fakeApi({ getWorkspace: vi.fn(async () => workspace('VIEWER')), listContacts }));
    expect(await screen.findByText('Najdenih: 2')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Iskanje'), 'sasa');
    expect(await screen.findByText('Najdenih: 1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bor Kos' })).not.toBeInTheDocument();
    expect(lastQuery(listContacts).q).toBe('sasa');
  });

  it('passes Tag, Attribute, country, company and sort filters to the API', async () => {
    const listContacts = vi.fn(async () => ({ items: [], total: 0, page: 0, size: 20 }));
    renderApp('/w/w1?tag=vip', fakeApi({ getWorkspace: vi.fn(async () => workspace('VIEWER')), listContacts }));
    await screen.findByText('Najdenih: 0');
    expect(lastQuery(listContacts).tag).toEqual(['vip']);
    await userEvent.type(screen.getByLabelText('Oznake'), ' novo');
    await userEvent.selectOptions(screen.getByLabelText('Ujemanje oznak'), 'any');
    await userEvent.type(screen.getByLabelText('Atribut (ključ ali ključ=vrednost)'), 'kompetenca=web');
    await userEvent.type(screen.getByLabelText('Država'), 'SI');
    await userEvent.type(screen.getByLabelText('Podjetje (natančno)'), 'Krka');
    await userEvent.selectOptions(screen.getByLabelText('Razvrsti po'), 'company');
    await waitFor(() =>
      expect(lastQuery(listContacts)).toMatchObject({
        tag: ['vip', 'novo'],
        tagMode: 'any',
        attr: ['kompetenca=web'],
        country: 'SI',
        company: 'Krka',
        sort: 'company',
      }),
    );
  });

  it('pages through the results', async () => {
    const listContacts = vi.fn(async (_w: string, q: ContactQuery) => ({ items: [contact({ id: `p${q.page}` })], total: 45, page: q.page ?? 0, size: 20 }));
    renderApp('/w/w1', fakeApi({ getWorkspace: vi.fn(async () => workspace('VIEWER')), listContacts }));
    expect(await screen.findByText('Stran 1 od 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Naslednja stran' }));
    expect(await screen.findByText('Stran 2 od 3')).toBeInTheDocument();
    expect(lastQuery(listContacts).page).toBe(1);
  });

  it('the Deleted view asks only for Deleted contacts', async () => {
    const listContacts = vi.fn(async () => ({ items: [contact({ deleted: true })], total: 1, page: 0, size: 20 }));
    renderApp('/w/w1/izbrisani', fakeApi({ getWorkspace: vi.fn(async () => workspace('EDITOR')), listContacts }));
    expect(await screen.findByRole('heading', { name: 'Izbrisani kontakti' })).toBeInTheDocument();
    await screen.findByText('Najdenih: 1');
    expect(lastQuery(listContacts).deleted).toBe(true);
    expect(screen.queryByRole('link', { name: 'Nov kontakt' })).not.toBeInTheDocument();
  });

  it('hides the new Contact link from Viewers', async () => {
    renderApp('/w/w1', fakeApi({ getWorkspace: vi.fn(async () => workspace('VIEWER')) }));
    await screen.findByText('Najdenih: 0');
    expect(screen.queryByRole('link', { name: 'Nov kontakt' })).not.toBeInTheDocument();
  });
});

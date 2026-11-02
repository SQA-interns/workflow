import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api, ContactQuery } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

const last = (fn: ReturnType<typeof vi.fn>) => (fn.mock.calls.at(-1) as unknown[])[1] as ContactQuery;

function setup(path: string, over: Partial<Api> = {}, role: 'OWNER' | 'EDITOR' | 'VIEWER' = 'EDITOR', total = 2) {
  const items = [contact({ id: 'a', tags: ['vip', 'novo'] }), contact({ id: 'b', firstName: 'Bor', lastName: 'Kos', email: 'bor@x.si', phone: '041', company: 'Krka', city: 'Kranj' })];
  const listContacts = vi.fn(async () => ({ items: total === 0 ? [] : items, total, page: 0, size: 20 }));
  renderApp(path, fakeApi({ getWorkspace: vi.fn(async () => workspace(role)), listContacts, ...over }));
  return listContacts;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('Contact list details', () => {
  it('shows the filters from the URL in the controls', async () => {
    setup('/w/w1?q=sasa&tag=a&tag=b&tagMode=any&sort=company&dir=desc&attr=k%3Dv');
    await screen.findByText('Najdenih: 2');
    expect(screen.getByLabelText('Iskanje')).toHaveValue('sasa');
    expect(screen.getByLabelText('Oznake')).toHaveValue('a b');
    expect(screen.getByLabelText('Atribut (ključ ali ključ=vrednost)')).toHaveValue('k=v');
    expect(screen.getByLabelText('Ujemanje oznak')).toHaveValue('any');
    expect(screen.getByLabelText('Razvrsti po')).toHaveValue('company');
    expect(screen.getByLabelText('Smer')).toHaveValue('desc');
  });

  it('defaults the controls and resets the page when a filter changes; clearing a filter removes it', async () => {
    const list = setup('/w/w1?page=1');
    await screen.findByText('Najdenih: 2');
    expect(screen.getByLabelText('Ujemanje oznak')).toHaveValue('all');
    expect(screen.getByLabelText('Razvrsti po')).toHaveValue('lastName');
    expect(screen.getByLabelText('Smer')).toHaveValue('');
    expect(last(list).page).toBe(1);
    await userEvent.type(screen.getByLabelText('Iskanje'), '  ana ');
    await waitFor(() => expect(last(list)).toMatchObject({ q: 'ana', page: 0 }));
    await userEvent.clear(screen.getByLabelText('Iskanje'));
    await waitFor(() => expect(last(list).q).toBeUndefined());
    await userEvent.selectOptions(screen.getByLabelText('Razvrsti po'), 'firstName');
    await waitFor(() => expect(last(list).sort).toBe('firstName'));
    await userEvent.selectOptions(screen.getByLabelText('Razvrsti po'), 'lastName');
    await waitFor(() => expect(last(list).sort).toBeUndefined());
    await userEvent.selectOptions(screen.getByLabelText('Ujemanje oznak'), 'any');
    await waitFor(() => expect(last(list).tagMode).toBe('any'));
    await userEvent.selectOptions(screen.getByLabelText('Ujemanje oznak'), 'all');
    await waitFor(() => expect(last(list).tagMode).toBeUndefined());
  });

  it('does not ask the API again while the typed value equals the URL', async () => {
    const list = setup('/w/w1?q=ana');
    await screen.findByText('Najdenih: 2');
    const calls = list.mock.calls.length;
    await new Promise((r) => setTimeout(r, 400));
    expect(list.mock.calls.length).toBe(calls);
  });

  it('follows a URL change from a Tag link', async () => {
    const list = setup('/w/w1', { listTags: vi.fn(async () => [{ name: 'vip', count: 1 }]) });
    await screen.findByText('Najdenih: 2');
    await userEvent.click(screen.getByRole('link', { name: 'Oznake' }));
    await userEvent.click(await screen.findByRole('link', { name: 'vip' }));
    await waitFor(() => expect(screen.getByLabelText('Oznake')).toHaveValue('vip'));
    expect(last(list).tag).toEqual(['vip']);
  });

  it('shows each row with its link, fields and Tags', async () => {
    setup('/w/w1');
    const row = (await screen.findByRole('link', { name: 'Bor Kos' })).closest('tr')!;
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/w/w1/kontakti/b');
    expect(row).toHaveTextContent('bor@x.si041KrkaKranj');
    const first = screen.getByRole('link', { name: 'Saša Novak' }).closest('tr')!;
    expect(within(first).getByText('vip')).toHaveClass('tag');
    expect(within(first).getByText('novo')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Kontakti' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kontakti');
    expect(screen.getByRole('link', { name: 'Nov kontakt' })).toHaveAttribute('href', '/w/w1/kontakti/nov');
    expect(screen.queryByRole('navigation', { name: 'Strani' })).not.toBeInTheDocument();
  });

  it('the header checkbox is checked only when every row is selected', async () => {
    setup('/w/w1');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Izberi Saša Novak' }));
    expect(screen.getByRole('checkbox', { name: 'Izberi vse na strani' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Počisti izbor' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Izberi Bor Kos' }));
    expect(screen.getByRole('checkbox', { name: 'Izberi vse na strani' })).toBeChecked();
  });

  it('an empty list has no table, no Export and an explanation', async () => {
    setup('/w/w1', {}, 'EDITOR', 0);
    expect(await screen.findByText('Ni kontaktov, ki bi ustrezali iskanju.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Izvozi vse najdene (0)' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Počisti izbor' })).not.toBeInTheDocument();
  });

  it('the Deleted view names its table and has no selection or Export', async () => {
    setup('/w/w1/izbrisani');
    expect(await screen.findByRole('table', { name: 'Izbrisani kontakti' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Izvozi/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Oznake')).not.toBeInTheDocument();
  });

  it('disables the Export button while exporting and cleans up the download link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finish: (v: { blob: Blob; filename: string }) => void = () => {};
    const exportContacts = vi.fn(() => new Promise<{ blob: Blob; filename: string }>((r) => (finish = r)));
    setup('/w/w1', { exportContacts });
    const button = await screen.findByRole('button', { name: 'Izvozi vse najdene (2)' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    finish({ blob: new Blob(['x']), filename: 'f.xlsx' });
    await waitFor(() => expect(button).toBeEnabled());
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    vi.useRealTimers();
  });

  it('pages: first page cannot go back, last page cannot go forward', async () => {
    const listContacts = vi.fn(async (_w: string, q: ContactQuery) => ({ items: [contact()], total: 40, page: q.page ?? 0, size: 20 }));
    renderApp('/w/w1', fakeApi({ getWorkspace: vi.fn(async () => workspace('VIEWER')), listContacts }));
    expect(await screen.findByText('Stran 1 od 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prejšnja stran' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Naslednja stran' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Naslednja stran' }));
    expect(await screen.findByText('Stran 2 od 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Naslednja stran' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prejšnja stran' })).toBeEnabled();
  });

  it('a submitted search form does not navigate', async () => {
    setup('/w/w1');
    const form = await screen.findByRole('search', { name: 'Iskanje in filtri' });
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

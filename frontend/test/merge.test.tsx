import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

const a = contact({ id: 'a', version: 2, email: 'sasa@example.si', city: null, attributes: [{ key: 'kompetenca', value: 'web' }] });
const b = contact({ id: 'b', version: 5, firstName: 'Sasa', email: 'SASA@example.si', city: 'Koper', attributes: [{ key: 'Kompetenca', value: 'dizajn' }] });

function api(role: 'OWNER' | 'EDITOR' | 'VIEWER', over: Partial<Api> = {}) {
  return fakeApi({
    getWorkspace: vi.fn(async () => workspace(role)),
    listDuplicateSets: vi.fn(async () => [{ contacts: [a, b], matches: [{ contactIds: ['a', 'b'], kind: 'EMAIL' as const, value: 'sasa@example.si' }] }]),
    ...over,
  });
}

describe('AC-011-07 merge dialog', () => {
  it('merges with the chosen Survivor, field and Attribute sources and the versions', async () => {
    const merge = vi.fn(async () => b);
    renderApp('/w/w1/dvojniki', api('EDITOR', { merge }));
    await userEvent.click(await screen.findByRole('button', { name: 'Združi skupino 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Združi kontakte' });
    await userEvent.click(within(dialog).getByLabelText('Ohrani Sasa Novak (SASA@example.si)'));
    await userEvent.click(within(dialog).getByLabelText('E-pošta: sasa@example.si'));
    await userEvent.click(within(dialog).getByLabelText('kompetenca: web'));
    expect(within(dialog).getByLabelText('Kraj: Koper')).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Potrdi združitev' }));
    await waitFor(() =>
      expect(merge).toHaveBeenCalledWith('w1', {
        survivorId: 'b',
        contacts: [
          { id: 'a', version: 2 },
          { id: 'b', version: 5 },
        ],
        fieldSources: { firstName: 'b', email: 'a', city: 'b' },
        attributeSources: { kompetenca: 'a' },
      }),
    );
    expect(await screen.findByText('Kontakti so združeni v »Sasa Novak«.')).toBeInTheDocument();
  });

  it('shows a conflict and keeps the dialog open', async () => {
    const merge = vi.fn(async () => {
      throw new ApiError(409, [{ field: 'version', message: 'outdated version' }]);
    });
    renderApp('/w/w1/dvojniki', api('EDITOR', { merge }));
    await userEvent.click(await screen.findByRole('button', { name: 'Združi skupino 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi združitev' }));
    expect(await screen.findByText(/medtem spremenil nekdo drug/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Združi kontakte' })).toBeInTheDocument();
  });

  it('refuses fewer than two Contacts', async () => {
    const merge = vi.fn();
    renderApp('/w/w1/dvojniki', api('EDITOR', { merge }));
    await userEvent.click(await screen.findByRole('button', { name: 'Združi skupino 1' }));
    await userEvent.click(screen.getByLabelText('Združi Sasa Novak'));
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi združitev' }));
    expect(screen.getByText('Izberite od 2 do 10 kontaktov.')).toBeInTheDocument();
    expect(merge).not.toHaveBeenCalled();
  });
});

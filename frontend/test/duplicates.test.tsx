import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { contact, fakeApi, renderApp, workspace } from './helpers';

describe('Duplicates', () => {
  it('lists Duplicate sets with links and match kinds', async () => {
    const listDuplicateSets = vi.fn(async () => [
      {
        contacts: [contact({ id: 'a' }), contact({ id: 'b', firstName: 'Sasa', email: 'SASA@example.si' })],
        matches: [{ contactIds: ['a', 'b'], kind: 'EMAIL' as const, value: 'sasa@example.si' }],
      },
    ]);
    renderApp('/w/w1/dvojniki', fakeApi({ getWorkspace: vi.fn(async () => workspace('VIEWER')), listDuplicateSets }));
    const group = await screen.findByRole('article', { name: 'Skupina dvojnikov 1' });
    expect(within(group).getByRole('link', { name: 'Sasa Novak' })).toHaveAttribute('href', '/w/w1/kontakti/b');
    expect(within(group).getByText('E-pošta: sasa@example.si')).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: /Združi/ })).not.toBeInTheDocument();
  });

  it('AC-010-07 the form shows the warning with links and the Contact stays saved', async () => {
    const createContact = vi.fn(async () => ({
      ...contact({ id: 'new', version: 1 }),
      possibleDuplicates: [
        { id: 'old', firstName: 'Saša', lastName: 'Novak', email: 'sasa@example.si', phone: null, matchKinds: ['EMAIL' as const, 'NAME' as const] },
      ],
    }));
    const updateContact = vi.fn(async () => ({ ...contact({ id: 'new', version: 2 }), possibleDuplicates: [] }));
    renderApp(
      '/w/w1/kontakti/nov',
      fakeApi({ getWorkspace: vi.fn(async () => workspace('EDITOR')), createContact, updateContact, getContact: vi.fn(async () => contact({ id: 'new' })) }),
    );
    await userEvent.type(await screen.findByLabelText('Ime'), 'Saša');
    await userEvent.type(screen.getByLabelText('Priimek'), 'Novak');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    const warning = await screen.findByText(/Kontakt je shranjen, vendar je podoben/);
    const box = warning.closest('.alert') as HTMLElement;
    expect(within(box).getByRole('link', { name: 'Saša Novak' })).toHaveAttribute('href', '/w/w1/kontakti/old');
    expect(within(box).getByText(/e-pošta, ime in priimek/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Odpri shranjeni kontakt' })).toHaveAttribute('href', '/w/w1/kontakti/new');
    expect(screen.getByRole('heading', { name: 'Uredi kontakt' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(updateContact).toHaveBeenCalledWith('w1', 'new', 1, expect.anything());
  });
});

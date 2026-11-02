import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type Api, type Contact } from '../src/lib/api';
import { contact, fakeApi, renderApp, workspace } from './helpers';

const fail = (status: number, field: string | null = null, message = 'x') =>
  vi.fn(async () => {
    throw new ApiError(status, [{ field, message }]);
  });
function api(role: 'OWNER' | 'EDITOR' | 'VIEWER', over: Partial<Api> = {}) {
  return fakeApi({ getWorkspace: vi.fn(async () => workspace(role)), ...over });
}
afterEach(() => vi.restoreAllMocks());

describe('Merge dialog details', () => {
  const a = contact({ id: 'a', version: 1, firstName: 'Ana', email: null, city: 'Kranj', attributes: [{ key: 'k', value: '1' }, { key: 'same', value: 's' }] });
  const b = contact({ id: 'b', version: 2, firstName: 'Ana', email: 'b@x.si', city: null, phone: '041', attributes: [{ key: 'K', value: '2' }, { key: 'same', value: 's' }, { key: 'only', value: 'o' }] });
  const c = contact({ id: 'c', version: 3, firstName: 'Ana', email: 'c@x.si', city: 'Celje', attributes: [{ key: 'k', value: '3' }] });

  function open(contacts: Contact[], over: Partial<Api> = {}) {
    renderApp('/w/w1/dvojniki', api('EDITOR', { listDuplicateSets: vi.fn(async () => [{ contacts, matches: [] }]), ...over }));
    return screen.findByRole('button', { name: 'Združi skupino 1' }).then((x) => userEvent.click(x));
  }

  it('opens as a modal when the browser supports it and closes it on cancel', async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
    Object.assign(HTMLDialogElement.prototype, { showModal, close });
    renderApp('/w/w1/dvojniki', api('EDITOR', { listDuplicateSets: vi.fn(async () => [{ contacts: [a, b], matches: [] }]) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Združi skupino 1' }));
    expect(showModal).toHaveBeenCalledTimes(1);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Prekliči' }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  it('shows only differing values, picks defaults like the API and sends what it shows', async () => {
    const merge = vi.fn(async () => a);
    renderApp('/w/w1/dvojniki', api('EDITOR', { listDuplicateSets: vi.fn(async () => [{ contacts: [a, b, c], matches: [] }]), merge }));
    await userEvent.click(await screen.findByRole('button', { name: 'Združi skupino 1' }));
    const d = screen.getByRole('dialog');
    expect(within(d).queryByRole('group', { name: 'Ime' })).not.toBeInTheDocument();
    expect(within(d).queryByRole('group', { name: 'Atribut same' })).not.toBeInTheDocument();
    expect(within(d).queryByRole('group', { name: 'Atribut only' })).not.toBeInTheDocument();
    expect(within(d).getByLabelText('E-pošta: (prazno)')).not.toBeChecked();
    expect(within(d).getByLabelText('E-pošta: b@x.si')).toBeChecked();
    expect(within(d).getByLabelText('Kraj: Kranj')).toBeChecked();
    expect(within(d).getByLabelText('k: 1')).toBeChecked();
    expect(within(d).getByLabelText('Ohrani Ana Novak')).toBeChecked();
    expect(within(d).getByLabelText('Ohrani Ana Novak (b@x.si)')).not.toBeChecked();
    await userEvent.click(within(d).getByLabelText('Ohrani Ana Novak (c@x.si)'));
    expect(within(d).getByLabelText('E-pošta: c@x.si')).toBeChecked();
    expect(within(d).getByLabelText('Kraj: Celje')).toBeChecked();
    expect(within(d).getByLabelText('k: 3')).toBeChecked();
    await userEvent.click(within(d).getByLabelText('Kraj: Kranj'));
    await userEvent.click(within(d).getByLabelText('k: 2'));
    await userEvent.click(within(d).getByLabelText('Združi Ana Novak', { selector: '#m-sel-a' }));
    expect(within(d).queryByLabelText('Kraj: Kranj')).not.toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'Potrdi združitev' }));
    await waitFor(() =>
      expect(merge).toHaveBeenCalledWith('w1', {
        survivorId: 'c',
        contacts: [
          { id: 'b', version: 2 },
          { id: 'c', version: 3 },
        ],
        fieldSources: { email: 'c', phone: 'b', city: 'c' },
        attributeSources: { k: 'b' },
      }),
    );
  });

  it('falls back to the first other Contact when the Survivor has no value, and to the first Contact when the Survivor is unselected', async () => {
    const merge = vi.fn(async () => a);
    await open([a, b, c], { merge });
    const d = screen.getByRole('dialog');
    await userEvent.click(within(d).getByLabelText('Ohrani Ana Novak (b@x.si)'));
    expect(within(d).getByLabelText('Kraj: Kranj')).toBeChecked();
    expect(within(d).getByLabelText('k: 2')).toBeChecked();
    await userEvent.click(within(d).getByRole('button', { name: 'Potrdi združitev' }));
    await waitFor(() => expect(merge).toHaveBeenCalledTimes(1));
    const req = (merge.mock.calls[0] as unknown[])[1] as { survivorId: string; fieldSources: Record<string, string>; attributeSources: Record<string, string> };
    expect(req.survivorId).toBe('b');
    expect(req.fieldSources.city).toBe('a');
    expect(req.attributeSources).toEqual({ k: 'b' });
  });

  it('when the chosen Survivor is unselected the first selected Contact survives', async () => {
    const merge = vi.fn(async () => a);
    await open([a, b, c], { merge });
    const d = screen.getByRole('dialog');
    await userEvent.click(within(d).getByLabelText('Ohrani Ana Novak (c@x.si)'));
    await userEvent.click(within(d).getByLabelText('Združi Ana Novak', { selector: '#m-sel-c' }));
    expect(within(d).getByLabelText('Ohrani Ana Novak')).toBeChecked();
    await userEvent.click(within(d).getByRole('button', { name: 'Potrdi združitev' }));
    await waitFor(() => expect(merge).toHaveBeenCalled());
    expect(((merge.mock.calls[0] as unknown[])[1] as { survivorId: string }).survivorId).toBe('a');
  });

  it('selects at most the first 10 Contacts, refuses more than 10, and disables confirming while it runs', async () => {
    const many = Array.from({ length: 11 }, (_, i) => contact({ id: `m${i}`, firstName: `Ime${i}` }));
    let done: (c: Contact) => void = () => {};
    const merge = vi.fn(() => new Promise<Contact>((r) => (done = r)));
    await open(many, { merge });
    const d = screen.getByRole('dialog');
    const boxes = within(d).getAllByRole('checkbox');
    expect(boxes.filter((x) => (x as HTMLInputElement).checked)).toHaveLength(10);
    expect(boxes[10]).not.toBeChecked();
    await userEvent.click(boxes[10]);
    await userEvent.click(within(d).getByRole('button', { name: 'Potrdi združitev' }));
    expect(within(d).getByRole('alert')).toHaveTextContent('Izberite od 2 do 10 kontaktov.');
    await userEvent.click(boxes[10]);
    await userEvent.click(within(d).getByRole('button', { name: 'Potrdi združitev' }));
    await waitFor(() => expect(merge).toHaveBeenCalled());
    expect(within(d).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Potrdi združitev' })).toBeDisabled();
    done(many[0]);
    expect(await screen.findByText(/Kontakti so združeni/)).toBeInTheDocument();
  });

  it('after a failed attempt the button is enabled again', async () => {
    await open([a, b], { merge: fail(500) });
    const d = screen.getByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: 'Potrdi združitev' }));
    expect(await within(d).findByRole('alert')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Potrdi združitev' })).toBeEnabled();
  });
});

describe('Duplicates page details', () => {
  it('numbers groups, shows email and phone when present and every match, and reloads after a Merge', async () => {
    const one = contact({ id: 'a', email: 'a@x.si', phone: null });
    const two = contact({ id: 'b', firstName: 'Bor', email: null, phone: '041' });
    const listDuplicateSets = vi
      .fn()
      .mockResolvedValueOnce([
        { contacts: [one, two], matches: [{ contactIds: ['a', 'b'], kind: 'NAME', value: 'x' }, { contactIds: ['a', 'b'], kind: 'EMAIL', value: 'x' }] },
        { contacts: [two, one], matches: [] },
      ])
      .mockResolvedValue([]);
    renderApp('/w/w1/dvojniki', api('EDITOR', { listDuplicateSets, merge: vi.fn(async () => one) }));
    const g1 = await screen.findByRole('article', { name: 'Skupina dvojnikov 1' });
    expect(within(g1).getByRole('heading')).toHaveTextContent('Skupina 1');
    expect(screen.getByRole('article', { name: 'Skupina dvojnikov 2' })).toBeInTheDocument();
    const items = within(g1).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/^Saša Novak · a@x\.si$/);
    expect(items[1]).toHaveTextContent(/^Bor Novak · 041$/);
    expect(g1).toHaveTextContent('Ujemanja: Ime in priimek: xE-pošta: x');
    expect(screen.queryByText('Ni najdenih dvojnikov.')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await userEvent.click(within(g1).getByRole('button', { name: 'Združi skupino 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi združitev' }));
    expect(await screen.findByText('Ni najdenih dvojnikov.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(listDuplicateSets).toHaveBeenCalledTimes(2);
  });
});

describe('Contact page details', () => {
  it('shows only filled fields, links and the version; deleting goes to the list', async () => {
    const deleteContact = vi.fn(async () => {});
    renderApp('/w/w1/kontakti/c1', api('EDITOR', { getContact: vi.fn(async () => contact({ version: 4, city: 'Kranj', attributes: [], tags: [] })), deleteContact }));
    expect(await screen.findByRole('link', { name: 'Uredi' })).toHaveAttribute('href', '/w/w1/kontakti/c1/uredi');
    expect(screen.getByRole('link', { name: 'Zgodovina sprememb' })).toHaveAttribute('href', '/w/w1/kontakti/c1/zgodovina');
    const props = screen.getAllByRole('term').map((t) => t.textContent);
    expect(props).toEqual(['Ime', 'Priimek', 'E-pošta', 'Kraj']);
    expect(screen.getByText('Ni atributov.')).toBeInTheDocument();
    expect(screen.getByText('Ni oznak.')).toBeInTheDocument();
    expect(screen.getByText('Različica 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Obnovi kontakt' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Izbriši' }));
    expect(await screen.findByRole('heading', { name: 'Kontakti' })).toBeInTheDocument();
  });

  it('shows Attributes and Tags, reloads after a restore and goes to the Deleted view after a purge', async () => {
    const getContact = vi
      .fn()
      .mockResolvedValueOnce(contact({ deleted: true, attributes: [{ key: 'k', value: 'v' }], tags: ['vip', 'novo'] }))
      .mockResolvedValue(contact({ deleted: false, tags: [] }));
    const restoreContact = vi.fn(async () => contact());
    const { unmount } = renderApp('/w/w1/kontakti/c1', api('OWNER', { getContact, restoreContact }));
    expect(await screen.findByText('vip')).toHaveClass('tag');
    expect(screen.getByText('novo')).toBeInTheDocument();
    expect(screen.getByText('k')).toBeInTheDocument();
    expect(screen.queryByText('Ni oznak.')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/^Kontakt je izbrisan\.$/);
    await userEvent.click(screen.getByRole('button', { name: 'Obnovi kontakt' }));
    expect(await screen.findByText('Ni oznak.')).toBeInTheDocument();
    expect(getContact).toHaveBeenCalledTimes(2);
    unmount();
    const purgeContact = vi.fn(async () => {});
    renderApp('/w/w1/kontakti/c1', api('OWNER', { getContact: vi.fn(async () => contact({ deleted: true })), purgeContact }));
    await userEvent.click(await screen.findByRole('button', { name: 'Trajno izbriši' }));
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi trajni izbris' }));
    expect(await screen.findByRole('heading', { name: 'Izbrisani kontakti' })).toBeInTheDocument();
  });

  it('a failed action shows its error, and the next one clears it', async () => {
    const restoreContact = vi.fn().mockRejectedValueOnce(new ApiError(409, [{ field: null, message: 'contact is not deleted' }])).mockResolvedValue(contact());
    renderApp('/w/w1/kontakti/c1', api('EDITOR', { getContact: vi.fn(async () => contact({ deleted: true })), restoreContact }));
    await userEvent.click(await screen.findByRole('button', { name: 'Obnovi kontakt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kontakt ni izbrisan.');
    await userEvent.click(screen.getByRole('button', { name: 'Obnovi kontakt' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('Contact form details', () => {
  it('shows every field with the right type, keeps an Attribute row, links back and edits the note', async () => {
    const createContact = vi.fn(async () => ({ ...contact({ id: 'n' }), possibleDuplicates: [] }));
    renderApp('/w/w1/kontakti/nov', api('EDITOR', { createContact, getContact: vi.fn(async () => contact({ id: 'n' })) }));
    expect(await screen.findByRole('heading', { name: 'Nov kontakt' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-pošta')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Ime')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Opomba').tagName).toBe('TEXTAREA');
    expect(screen.getAllByRole('textbox').length).toBe(10 + 1 + 1);
    expect(screen.getByRole('link', { name: 'Prekliči' })).toHaveAttribute('href', '/w/w1');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    expect(screen.getByLabelText('Ključ 1')).toHaveValue('');
    expect(screen.getByLabelText('Vrednost 1')).toHaveValue('');
    await userEvent.type(screen.getByLabelText('Ključ 1'), 'k');
    await userEvent.type(screen.getByLabelText('Vrednost 1'), 'v');
    await userEvent.type(screen.getByLabelText('Ime'), 'Ana');
    await userEvent.type(screen.getByLabelText('Opomba'), 'Zapis');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(createContact).toHaveBeenCalled());
    expect(((createContact.mock.calls[0] as unknown[])[1] as { note: string; attributes: unknown }).note).toBe('Zapis');
  });

  it('shows a list error for too many Attributes, field errors without an alert, and a 500 as an alert', async () => {
    const createContact = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(400, [{ field: 'attributes', message: 'too many attributes' }, { field: 'city', message: 'at most 100 characters' }]))
      .mockRejectedValueOnce(new ApiError(500, []));
    renderApp('/w/w1/kontakti/nov', api('EDITOR', { createContact }));
    await userEvent.type(await screen.findByLabelText('Ime'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(await screen.findByText('Največ 100 atributov.')).toHaveClass('error');
    expect(screen.getByLabelText('Kraj')).toHaveAccessibleDescription('Največ 100 znakov.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Prišlo je do napake.');
    expect(screen.queryByText('Največ 100 atributov.')).not.toBeInTheDocument();
  });

  it('disables saving while it runs; a duplicate warning keeps editing the saved Contact and a later save clears it', async () => {
    let finish: (v: unknown) => void = () => {};
    const createContact = vi.fn(() => new Promise((r) => (finish = r)));
    const updateContact = vi.fn(async () => ({ ...contact({ id: 'n', version: 2 }), possibleDuplicates: [] }));
    renderApp('/w/w1/kontakti/nov', api('EDITOR', { createContact: createContact as never, updateContact, getContact: vi.fn(async () => contact({ id: 'n' })) }));
    await userEvent.type(await screen.findByLabelText('Ime'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(screen.getByRole('button', { name: 'Shrani' })).toBeDisabled();
    finish({ ...contact({ id: 'n', version: 1, firstName: 'Ana', lastName: 'Kos' }), possibleDuplicates: [{ id: 'o', firstName: 'Ana', lastName: 'Kos', email: null, phone: null, matchKinds: ['NAME'] }] });
    expect(await screen.findByRole('link', { name: 'Odpri shranjeni kontakt' })).toHaveAttribute('href', '/w/w1/kontakti/n');
    expect(screen.getByRole('heading', { name: 'Uredi kontakt' })).toBeInTheDocument();
    expect(screen.getByLabelText('Priimek')).toHaveValue('Kos');
    expect(screen.getByRole('link', { name: 'Prekliči' })).toHaveAttribute('href', '/w/w1/kontakti/n');
    expect(screen.getByRole('button', { name: 'Shrani' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    expect(updateContact).toHaveBeenCalledWith('w1', 'n', 1, expect.anything());
    expect(screen.queryByRole('link', { name: 'Odpri shranjeni kontakt' })).not.toBeInTheDocument();
  });

  it('a 409 shows the conflict and clears it on the next save', async () => {
    const updateContact = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, [{ field: 'version', message: 'outdated version' }]))
      .mockRejectedValueOnce(new ApiError(400, [{ field: 'city', message: 'required' }]));
    renderApp('/w/w1/kontakti/c1/uredi', api('EDITOR', { getContact: vi.fn(async () => contact()), updateContact }));
    await userEvent.click(await screen.findByRole('button', { name: 'Shrani' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nekdo drug');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Kraj')).toHaveAccessibleDescription('Polje je obvezno.');
  });
});

describe('History page details', () => {
  it('says when a Revision changed no data, and shows the restore message once', async () => {
    const state = { ...contact(), deleted: false, mergedInto: null };
    const restoreRevision = vi.fn().mockResolvedValueOnce(contact()).mockRejectedValueOnce(new ApiError(500, []));
    renderApp(
      '/w/w1/kontakti/c1/zgodovina',
      api('EDITOR', {
        getContact: vi.fn(async () => contact({ version: 3 })),
        listRevisions: vi.fn(async () => [
          { number: 2, type: 'RESTORE' as const, author: { id: 'u', email: 'a@b.si', displayName: 'Ana' }, createdAt: '2026-01-01T00:00:00Z', state },
          { number: 1, type: 'CREATE' as const, author: { id: 'u', email: 'a@b.si', displayName: 'Ana' }, createdAt: '2026-01-01T00:00:00Z', state },
        ]),
        restoreRevision,
      }),
    );
    const two = await screen.findByRole('listitem', { name: 'Revizija 2' });
    expect(within(two).getByText('Brez sprememb podatkov.')).toBeInTheDocument();
    expect(within(two).queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nazaj na kontakt' })).toHaveAttribute('href', '/w/w1/kontakti/c1');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await userEvent.click(within(two).getByRole('button', { name: 'Obnovi revizijo 2' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Revizija 2 je obnovljena kot nova revizija.');
    await userEvent.click(screen.getByRole('button', { name: 'Obnovi revizijo 1' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Tags page details', () => {
  it('links each Tag to the filtered list, shows the actions column only to Editors, and trims a new name', async () => {
    const renameTag = vi.fn(async () => ({ name: 'novo', count: 1 }));
    const { unmount } = renderApp('/w/w1/oznake', api('EDITOR', { listTags: vi.fn(async () => [{ name: 'a b', count: 1 }]), renameTag }));
    expect(await screen.findByRole('link', { name: 'a b' })).toHaveAttribute('href', '/w/w1?tag=a%20b');
    expect(screen.getByRole('columnheader', { name: 'Dejanja' })).toBeInTheDocument();
    expect(screen.queryByText('V tem delovnem prostoru še ni oznak.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Preimenuj a b' }));
    expect(screen.getByLabelText('Novo ime za a b')).toHaveValue('a b');
    await userEvent.clear(screen.getByLabelText('Novo ime za a b'));
    await userEvent.type(screen.getByLabelText('Novo ime za a b'), '  novo ');
    await userEvent.click(screen.getByRole('button', { name: 'Shrani ime' }));
    expect(renameTag).toHaveBeenCalledWith('w1', 'a b', 'novo');
    unmount();
    renderApp('/w/w1/oznake', api('VIEWER', { listTags: vi.fn(async () => [{ name: 'x', count: 1 }]) }));
    await screen.findByRole('link', { name: 'x' });
    expect(screen.queryByRole('columnheader', { name: 'Dejanja' })).not.toBeInTheDocument();
  });

  it('refuses an empty or over-long name, accepts 50 characters, shows a field-less API error, and resets the error on reopen', async () => {
    const renameTag = vi.fn().mockRejectedValueOnce(new ApiError(500, [])).mockResolvedValue({ name: 'x', count: 1 });
    const deleteTag = vi.fn().mockRejectedValueOnce(new ApiError(500, [])).mockResolvedValue(undefined);
    renderApp('/w/w1/oznake', api('EDITOR', { listTags: vi.fn(async () => [{ name: 'vip', count: 1 }]), renameTag, deleteTag }));
    await userEvent.click(await screen.findByRole('button', { name: 'Preimenuj vip' }));
    const input = screen.getByLabelText('Novo ime za vip');
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Shrani ime' }));
    expect(input).toHaveAccessibleDescription(/ne sme vsebovati/);
    await userEvent.type(input, 'x'.repeat(51));
    await userEvent.click(screen.getByRole('button', { name: 'Shrani ime' }));
    expect(input).toHaveAccessibleDescription(/ne sme vsebovati/);
    expect(renameTag).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, 'x'.repeat(50));
    await userEvent.click(screen.getByRole('button', { name: 'Shrani ime' }));
    await waitFor(() => expect(input).toHaveAccessibleDescription('Prišlo je do napake.'));
    await userEvent.click(screen.getByRole('button', { name: 'Prekliči' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preimenuj vip' }));
    expect(screen.getByLabelText('Novo ime za vip')).not.toHaveAccessibleDescription();
    await userEvent.click(screen.getByRole('button', { name: 'Shrani ime' }));
    await waitFor(() => expect(screen.queryByLabelText('Novo ime za vip')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Izbriši vip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi izbris vip' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Potrdi izbris vip' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Potrdi izbris vip' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Potrdi izbris vip' })).not.toBeInTheDocument();
  });
});

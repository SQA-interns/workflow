import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, filenameOf, httpApi, queryString } from '../src/lib/api';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function stubFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call = {
        url,
        method: init.method ?? 'GET',
        headers: (init.headers ?? {}) as Record<string, string>,
        body: init.body === undefined ? undefined : JSON.parse(init.body as string),
      };
      calls.push(call);
      return respond(call);
    }),
  );
  return calls;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('httpApi: the frontend boundary to the REST API', () => {
  it('sends the token and JSON body and returns the parsed answer', async () => {
    const calls = stubFetch(() => json(201, { id: 'w1', name: 'Projekt', role: 'OWNER' }));
    const api = httpApi(async () => 'tok', 'http://x');
    await expect(api.createWorkspace('Projekt')).resolves.toEqual({ id: 'w1', name: 'Projekt', role: 'OWNER' });
    expect(calls[0]).toEqual({
      url: 'http://x/api/workspaces',
      method: 'POST',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
      body: { name: 'Projekt' },
    });
  });

  it('sends no Authorization header without a token and no body for GET', async () => {
    const calls = stubFetch(() => json(200, []));
    await httpApi(async () => null).listWorkspaces();
    expect(calls[0].headers).toEqual({});
    expect(calls[0].body).toBeUndefined();
    expect(calls[0].url).toBe('/api/workspaces');
  });

  it('turns an error answer into an ApiError with its field errors', async () => {
    stubFetch(() => json(400, { errors: [{ field: 'name', message: 'required' }] }));
    const err = await httpApi(async () => 't').createWorkspace('').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).errors).toEqual([{ field: 'name', message: 'required' }]);
    expect((err as ApiError).message).toBe('API 400');
  });

  it('an error answer without JSON or without errors gives an empty list', async () => {
    stubFetch(() => new Response('<html>', { status: 502 }));
    const err = (await httpApi(async () => 't').me().catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.errors).toEqual([]);
    stubFetch(() => json(500, {}));
    const err2 = (await httpApi(async () => 't').me().catch((e: unknown) => e)) as ApiError;
    expect(err2.errors).toEqual([]);
  });

  it('uses the contract paths and methods for every call', async () => {
    const calls = stubFetch(() => json(200, {}));
    const api = httpApi(async () => 't');
    const input = { firstName: 'A' } as never;
    const steps: [() => Promise<unknown>, string, string, unknown?][] = [
      [() => api.me(), 'GET', '/api/me'],
      [() => api.getWorkspace('w 1'), 'GET', '/api/workspaces/w%201'],
      [() => api.renameWorkspace('w1', 'N'), 'PATCH', '/api/workspaces/w1', { name: 'N' }],
      [() => api.deleteWorkspace('w1', 'N'), 'DELETE', '/api/workspaces/w1', { confirmName: 'N' }],
      [() => api.listMembers('w1'), 'GET', '/api/workspaces/w1/members'],
      [() => api.addMember('w1', 'a@b.si', 'EDITOR'), 'POST', '/api/workspaces/w1/members', { email: 'a@b.si', role: 'EDITOR' }],
      [() => api.changeRole('w1', 'u1', 'VIEWER'), 'PATCH', '/api/workspaces/w1/members/u1', { role: 'VIEWER' }],
      [() => api.removeMember('w1', 'u1'), 'DELETE', '/api/workspaces/w1/members/u1'],
      [() => api.cancelInvitation('w1', 'i1'), 'DELETE', '/api/workspaces/w1/invitations/i1'],
      [() => api.listContacts('w1', { q: 'a' }), 'GET', '/api/workspaces/w1/contacts?q=a'],
      [() => api.getContact('w1', 'c1'), 'GET', '/api/workspaces/w1/contacts/c1'],
      [() => api.createContact('w1', input), 'POST', '/api/workspaces/w1/contacts', { firstName: 'A' }],
      [() => api.updateContact('w1', 'c1', 3, input), 'PUT', '/api/workspaces/w1/contacts/c1', { firstName: 'A', version: 3 }],
      [() => api.deleteContact('w1', 'c1', 3), 'DELETE', '/api/workspaces/w1/contacts/c1?version=3'],
      [() => api.restoreContact('w1', 'c1'), 'POST', '/api/workspaces/w1/contacts/c1/restore'],
      [() => api.purgeContact('w1', 'c1'), 'POST', '/api/workspaces/w1/contacts/c1/purge'],
      [() => api.listRevisions('w1', 'c1'), 'GET', '/api/workspaces/w1/contacts/c1/revisions'],
      [() => api.restoreRevision('w1', 'c1', 2, 5), 'POST', '/api/workspaces/w1/contacts/c1/revisions/2/restore', { version: 5 }],
      [() => api.listTags('w1'), 'GET', '/api/workspaces/w1/tags'],
      [() => api.renameTag('w1', 'a/b', 'c'), 'PATCH', '/api/workspaces/w1/tags/a%2Fb', { name: 'c' }],
      [() => api.deleteTag('w1', 'a'), 'DELETE', '/api/workspaces/w1/tags/a'],
      [() => api.listDuplicateSets('w1'), 'GET', '/api/workspaces/w1/duplicate-sets'],
      [() => api.merge('w1', { survivorId: 's' } as never), 'POST', '/api/workspaces/w1/merge', { survivorId: 's' }],
    ];
    for (const [fn, method, url, body] of steps) {
      calls.length = 0;
      await fn();
      expect(calls[0].method, url).toBe(method);
      expect(calls[0].url).toBe(url);
      expect(calls[0].body).toEqual(body);
    }
  });

  it('downloads an Export with its file name', async () => {
    const calls = stubFetch(
      () =>
        new Response('xlsx', {
          status: 200,
          headers: { 'Content-Disposition': `attachment; filename="Skofja-2026.xlsx"; filename*=UTF-8''%C5%A0kofja-2026.xlsx` },
        }),
    );
    const file = await httpApi(async () => 't').exportContacts('w1', { contactIds: ['a'] });
    expect(file.filename).toBe('Škofja-2026.xlsx');
    expect(file.blob.size).toBe(4);
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/workspaces/w1/export', body: { contactIds: ['a'] } });
  });
});

describe('queryString', () => {
  it('is empty without parameters', () => {
    expect(queryString({})).toBe('');
  });

  it('writes every parameter of the contract', () => {
    expect(
      queryString({
        q: 'saša',
        tag: ['a', 'b'],
        tagMode: 'any',
        attr: ['k=v', 'x'],
        country: 'SI',
        company: 'Krka',
        deleted: true,
        sort: 'company',
        dir: 'desc',
        page: 0,
        size: 20,
      }),
    ).toBe('?q=sa%C5%A1a&tag=a&tag=b&tagMode=any&attr=k%3Dv&attr=x&country=SI&company=Krka&deleted=true&sort=company&dir=desc&page=0&size=20');
  });

  it('leaves out deleted=false', () => {
    expect(queryString({ deleted: false })).toBe('');
  });
});

describe('filenameOf', () => {
  it('prefers the UTF-8 name, falls back to the plain one and then to a default', () => {
    expect(filenameOf(`attachment; filename="a.xlsx"; filename*=UTF-8''%C4%8D.xlsx`)).toBe('č.xlsx');
    expect(filenameOf(`attachment; filename="a.xlsx"; filename*=UTF-8''%E0%A4%A`)).toBe('a.xlsx');
    expect(filenameOf('attachment; filename="b.xlsx"')).toBe('b.xlsx');
    expect(filenameOf('')).toBe('kontakti.xlsx');
  });
});

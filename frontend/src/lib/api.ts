// The frontend's one boundary to the REST API (docs/api-contract.md). Component tests fake `Api`.

export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface FieldError {
  field: string | null;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: FieldError[],
  ) {
    super(`API ${status}`);
  }
}

export interface Me {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  role: Role;
}

export interface Member {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: Role;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Attribute {
  key: string;
  value: string;
}

export const PREDEFINED_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'street',
  'postalCode',
  'city',
  'country',
  'note',
] as const;
export type PredefinedField = (typeof PREDEFINED_FIELDS)[number];

export type ContactFields = Record<PredefinedField, string | null>;

export interface ContactInput extends ContactFields {
  attributes: Attribute[];
  tags: string[];
}

export interface Contact extends ContactInput {
  id: string;
  version: number;
  deleted: boolean;
  mergedInto: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MatchKind = 'EMAIL' | 'PHONE' | 'NAME';

export interface PossibleDuplicate {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  matchKinds: MatchKind[];
}

export interface SavedContact extends Contact {
  possibleDuplicates: PossibleDuplicate[];
}

export interface ContactPage {
  items: Contact[];
  total: number;
  page: number;
  size: number;
}

export type SortField = 'lastName' | 'firstName' | 'company' | 'updatedAt';

export interface ContactQuery {
  q?: string;
  tag?: string[];
  tagMode?: 'all' | 'any';
  attr?: string[];
  country?: string;
  company?: string;
  deleted?: boolean;
  sort?: SortField;
  dir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

export type RevisionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'MERGE' | 'MERGED_AWAY';

export interface ContactState extends ContactInput {
  deleted: boolean;
  mergedInto: string | null;
}

export interface Revision {
  number: number;
  type: RevisionType;
  author: { id: string; email: string | null; displayName: string | null };
  createdAt: string;
  state: ContactState;
}

export interface TagCount {
  name: string;
  count: number;
}

export interface DuplicateSet {
  contacts: Contact[];
  matches: { contactIds: string[]; kind: MatchKind; value: string }[];
}

export interface MergeRequest {
  survivorId: string;
  contacts: { id: string; version: number }[];
  fieldSources: Partial<Record<PredefinedField, string>>;
  attributeSources: Record<string, string>;
}

export interface ExportRequest {
  contactIds?: string[];
  filter?: Omit<ContactQuery, 'page' | 'size' | 'deleted'>;
}

export interface Download {
  blob: Blob;
  filename: string;
}

export interface Api {
  me(): Promise<Me>;
  listWorkspaces(): Promise<Workspace[]>;
  createWorkspace(name: string): Promise<Workspace>;
  getWorkspace(wid: string): Promise<Workspace>;
  renameWorkspace(wid: string, name: string): Promise<Workspace>;
  deleteWorkspace(wid: string, confirmName: string): Promise<void>;

  listMembers(wid: string): Promise<{ members: Member[]; invitations: Invitation[] }>;
  addMember(wid: string, email: string, role: Role): Promise<{ status: 'MEMBER' | 'INVITED' }>;
  changeRole(wid: string, userId: string, role: Role): Promise<Member>;
  removeMember(wid: string, userId: string): Promise<void>;
  cancelInvitation(wid: string, id: string): Promise<void>;

  listContacts(wid: string, query: ContactQuery): Promise<ContactPage>;
  getContact(wid: string, cid: string): Promise<Contact>;
  createContact(wid: string, input: ContactInput): Promise<SavedContact>;
  updateContact(wid: string, cid: string, version: number, input: ContactInput): Promise<SavedContact>;
  deleteContact(wid: string, cid: string, version: number): Promise<void>;
  restoreContact(wid: string, cid: string): Promise<Contact>;
  purgeContact(wid: string, cid: string): Promise<void>;
  listRevisions(wid: string, cid: string): Promise<Revision[]>;
  restoreRevision(wid: string, cid: string, number: number, version: number): Promise<Contact>;

  listTags(wid: string): Promise<TagCount[]>;
  renameTag(wid: string, name: string, newName: string): Promise<TagCount>;
  deleteTag(wid: string, name: string): Promise<void>;

  listDuplicateSets(wid: string): Promise<DuplicateSet[]>;
  merge(wid: string, request: MergeRequest): Promise<Contact>;
  exportContacts(wid: string, request: ExportRequest): Promise<Download>;
}

export function queryString(q: ContactQuery): string {
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  q.tag?.forEach((t) => p.append('tag', t));
  if (q.tagMode) p.set('tagMode', q.tagMode);
  q.attr?.forEach((a) => p.append('attr', a));
  if (q.country) p.set('country', q.country);
  if (q.company) p.set('company', q.company);
  if (q.deleted) p.set('deleted', 'true');
  if (q.sort) p.set('sort', q.sort);
  if (q.dir) p.set('dir', q.dir);
  if (q.page !== undefined) p.set('page', String(q.page));
  if (q.size !== undefined) p.set('size', String(q.size));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The download name from Content-Disposition, preferring the UTF-8 form. */
export function filenameOf(disposition: string): string {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // fall back to the plain name
    }
  }
  const plain = /filename="([^"]+)"/.exec(disposition);
  return plain ? plain[1] : 'kontakti.xlsx';
}

export function httpApi(getToken: () => Promise<string | null>, base = ''): Api {
  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let errors: FieldError[] = [];
      try {
        errors = ((await res.json()) as { errors?: FieldError[] }).errors ?? [];
      } catch {
        errors = [];
      }
      throw new ApiError(res.status, errors);
    }
    return res;
  }
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    (await call(method, path, body)).json() as Promise<T>;
  const none = async (method: string, path: string, body?: unknown): Promise<void> => {
    await call(method, path, body);
  };
  const w = (wid: string) => `/api/workspaces/${encodeURIComponent(wid)}`;
  const c = (wid: string, cid: string) => `${w(wid)}/contacts/${encodeURIComponent(cid)}`;

  return {
    me: () => json('GET', '/api/me'),
    listWorkspaces: () => json('GET', '/api/workspaces'),
    createWorkspace: (name) => json('POST', '/api/workspaces', { name }),
    getWorkspace: (wid) => json('GET', w(wid)),
    renameWorkspace: (wid, name) => json('PATCH', w(wid), { name }),
    deleteWorkspace: (wid, confirmName) => none('DELETE', w(wid), { confirmName }),

    listMembers: (wid) => json('GET', `${w(wid)}/members`),
    addMember: (wid, email, role) => json('POST', `${w(wid)}/members`, { email, role }),
    changeRole: (wid, userId, role) =>
      json('PATCH', `${w(wid)}/members/${encodeURIComponent(userId)}`, { role }),
    removeMember: (wid, userId) => none('DELETE', `${w(wid)}/members/${encodeURIComponent(userId)}`),
    cancelInvitation: (wid, id) => none('DELETE', `${w(wid)}/invitations/${encodeURIComponent(id)}`),

    listContacts: (wid, query) => json('GET', `${w(wid)}/contacts${queryString(query)}`),
    getContact: (wid, cid) => json('GET', c(wid, cid)),
    createContact: (wid, input) => json('POST', `${w(wid)}/contacts`, input),
    updateContact: (wid, cid, version, input) => json('PUT', c(wid, cid), { ...input, version }),
    deleteContact: (wid, cid, version) => none('DELETE', `${c(wid, cid)}?version=${version}`),
    restoreContact: (wid, cid) => json('POST', `${c(wid, cid)}/restore`),
    purgeContact: (wid, cid) => none('POST', `${c(wid, cid)}/purge`),
    listRevisions: (wid, cid) => json('GET', `${c(wid, cid)}/revisions`),
    restoreRevision: (wid, cid, number, version) =>
      json('POST', `${c(wid, cid)}/revisions/${number}/restore`, { version }),

    listTags: (wid) => json('GET', `${w(wid)}/tags`),
    renameTag: (wid, name, newName) =>
      json('PATCH', `${w(wid)}/tags/${encodeURIComponent(name)}`, { name: newName }),
    deleteTag: (wid, name) => none('DELETE', `${w(wid)}/tags/${encodeURIComponent(name)}`),

    listDuplicateSets: (wid) => json('GET', `${w(wid)}/duplicate-sets`),
    merge: (wid, request) => json('POST', `${w(wid)}/merge`, request),
    exportContacts: async (wid, request) => {
      const res = await call('POST', `${w(wid)}/export`, request);
      return { blob: await res.blob(), filename: filenameOf(res.headers.get('Content-Disposition') ?? '') };
    },
  };
}

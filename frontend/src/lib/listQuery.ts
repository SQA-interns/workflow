import type { ContactQuery, SortField } from './api';
import { splitTags } from './contactForm';

export const PAGE_SIZE = 20;

/** The list's search and filters live in the URL, so they survive navigation and links like ?tag=x. */
export function queryFromParams(p: URLSearchParams): ContactQuery {
  const tags = p.getAll('tag').flatMap(splitTags);
  return {
    q: p.get('q') ?? undefined,
    tag: tags.length ? tags : undefined,
    tagMode: p.get('tagMode') === 'any' ? 'any' : undefined,
    attr: p.getAll('attr').filter(Boolean),
    country: p.get('country') ?? undefined,
    company: p.get('company') ?? undefined,
    sort: (p.get('sort') as SortField | null) ?? undefined,
    dir: p.get('dir') === 'desc' ? 'desc' : p.get('dir') === 'asc' ? 'asc' : undefined,
    page: Number(p.get('page') ?? 0) || 0,
    size: PAGE_SIZE,
  };
}

/** The filter part only (for Export): no paging. */
export function filterOf(q: ContactQuery) {
  const { page: _page, size: _size, deleted: _deleted, ...filter } = q;
  void _page;
  void _size;
  void _deleted;
  return Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)),
  );
}

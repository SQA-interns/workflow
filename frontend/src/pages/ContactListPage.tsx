import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Contact, ContactPage } from '../lib/api';
import { useApi } from '../lib/context';
import { errorText } from '../lib/messages';
import { PAGE_SIZE, filterOf, queryFromParams } from '../lib/listQuery';
import { can } from '../lib/roles';
import { Alert } from '../components/Alert';
import { contactName } from './ContactPage';
import { useWorkspace } from './WorkspaceLayout';

const SORTS = [
  ['lastName', 'Priimek'],
  ['firstName', 'Ime'],
  ['company', 'Podjetje'],
  ['updatedAt', 'Zadnja sprememba'],
] as const;

/** One text input bound to a URL parameter; updates the list while typing, without a reload. */
function ParamInput({ label, name, params, set }: { label: string; name: string; params: URLSearchParams; set: (n: string, v: string) => void }) {
  const [value, setValue] = useState(params.getAll(name).join(' '));
  const current = params.getAll(name).join(' ');
  useEffect(() => setValue(current), [current]);
  useEffect(() => {
    if (value === current) return;
    const t = setTimeout(() => set(name, value), 250);
    return () => clearTimeout(t);
  }, [value, current, name, set]);
  return (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      <input id={`f-${name}`} type="search" value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}

export function ContactListPage({ deleted = false }: { deleted?: boolean }) {
  const api = useApi();
  const { workspace } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => ({ ...queryFromParams(params), deleted }), [params, deleted]);
  const [page, setPage] = useState<ContactPage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const key = JSON.stringify(query);

  useEffect(() => {
    let active = true;
    api.listContacts(workspace.id, query).then(
      (p) => {
        if (active) {
          setPage(p);
          setError(null);
        }
      },
      (e: unknown) => {
        if (active) setError(e);
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, workspace.id, key]);

  // Several debounced inputs may fire before a re-render; build on the latest params, not the rendered ones.
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);
  const set = useMemo(
    () => (name: string, value: string) => {
      const next = new URLSearchParams(latest.current);
      next.delete(name);
      if (value.trim()) next.set(name, value.trim());
      if (name !== 'page') next.delete('page');
      latest.current = next;
      setParams(next, { replace: true });
    },
    [setParams],
  );

  function toggle(id: string) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportContacts() {
    setExportError(null);
    setExporting(true);
    try {
      const request = selected.size > 0 ? { contactIds: [...selected] } : { filter: filterOf(query) };
      const file = await api.exportContacts(workspace.id, request);
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(errorText(e));
    } finally {
      setExporting(false);
    }
  }

  const items: Contact[] = page?.items ?? [];
  const allOnPage = items.length > 0 && items.every((c) => selected.has(c.id));
  const pages = page ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : 1;
  const current = query.page ?? 0;

  return (
    <section>
      <h1>{deleted ? 'Izbrisani kontakti' : 'Kontakti'}</h1>
      {!deleted && can(workspace.role, 'EDITOR') && (
        <p>
          <Link to={`/w/${workspace.id}/kontakti/nov`}>Nov kontakt</Link>
        </p>
      )}
      <form role="search" aria-label="Iskanje in filtri" className="toolbar" onSubmit={(e) => e.preventDefault()}>
        <ParamInput label="Iskanje" name="q" params={params} set={set} />
        {!deleted && (
          <>
            <ParamInput label="Oznake" name="tag" params={params} set={set} />
            <div className="field">
              <label htmlFor="f-tagMode">Ujemanje oznak</label>
              <select id="f-tagMode" value={query.tagMode ?? 'all'} onChange={(e) => set('tagMode', e.target.value === 'any' ? 'any' : '')}>
                <option value="all">vse oznake</option>
                <option value="any">katera koli oznaka</option>
              </select>
            </div>
            <ParamInput label="Atribut (ključ ali ključ=vrednost)" name="attr" params={params} set={set} />
            <ParamInput label="Država" name="country" params={params} set={set} />
            <ParamInput label="Podjetje (natančno)" name="company" params={params} set={set} />
          </>
        )}
        <div className="field">
          <label htmlFor="f-sort">Razvrsti po</label>
          <select id="f-sort" value={query.sort ?? 'lastName'} onChange={(e) => set('sort', e.target.value === 'lastName' ? '' : e.target.value)}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-dir">Smer</label>
          <select id="f-dir" value={query.dir ?? ''} onChange={(e) => set('dir', e.target.value)}>
            <option value="">privzeto</option>
            <option value="asc">naraščajoče</option>
            <option value="desc">padajoče</option>
          </select>
        </div>
      </form>
      {error ? <Alert>{errorText(error)}</Alert> : null}
      {page && (
        <p role="status" aria-live="polite">
          Najdenih: {page.total}
        </p>
      )}
      {!deleted && page && (
        <div className="actions">
          <button type="button" className="primary" disabled={exporting || (selected.size === 0 && page.total === 0)} onClick={() => void exportContacts()}>
            {selected.size > 0 ? `Izvozi izbrane (${selected.size})` : `Izvozi vse najdene (${page.total})`}
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())}>
              Počisti izbor
            </button>
          )}
        </div>
      )}
      {exportError && <Alert>{exportError}</Alert>}
      {page && items.length > 0 && (
        <table>
          <caption className="sr-only">{deleted ? 'Izbrisani kontakti' : 'Kontakti'}</caption>
          <thead>
            <tr>
              {!deleted && (
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Izberi vse na strani"
                    checked={allOnPage}
                    onChange={() =>
                      setSelected((old) => {
                        const next = new Set(old);
                        items.forEach((c) => (allOnPage ? next.delete(c.id) : next.add(c.id)));
                        return next;
                      })
                    }
                  />
                </th>
              )}
              <th scope="col">Ime in priimek</th>
              <th scope="col">E-pošta</th>
              <th scope="col">Telefon</th>
              <th scope="col">Podjetje</th>
              <th scope="col">Kraj</th>
              <th scope="col">Oznake</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                {!deleted && (
                  <td>
                    <input type="checkbox" aria-label={`Izberi ${contactName(c)}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  </td>
                )}
                <td>
                  <Link to={`/w/${workspace.id}/kontakti/${c.id}`}>{contactName(c)}</Link>
                </td>
                <td>{c.email}</td>
                <td>{c.phone}</td>
                <td>{c.company}</td>
                <td>{c.city}</td>
                <td>
                  {c.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {page && items.length === 0 && <p>{deleted ? 'Ni izbrisanih kontaktov.' : 'Ni kontaktov, ki bi ustrezali iskanju.'}</p>}
      {page && pages > 1 && (
        <nav className="pager" aria-label="Strani">
          <button type="button" disabled={current === 0} onClick={() => set('page', String(current - 1))}>
            Prejšnja stran
          </button>
          <span>
            Stran {current + 1} od {pages}
          </span>
          <button type="button" disabled={current + 1 >= pages} onClick={() => set('page', String(current + 1))}>
            Naslednja stran
          </button>
        </nav>
      )}
    </section>
  );
}

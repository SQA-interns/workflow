import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, type RevisionType } from '../lib/api';
import { useApi } from '../lib/context';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/messages';
import { diff } from '../lib/diff';
import { can } from '../lib/roles';
import { Alert } from '../components/Alert';
import { NotFoundPage } from './NotFoundPage';
import { contactName } from './ContactPage';
import { useWorkspace } from './WorkspaceLayout';

const TYPE_LABEL: Record<RevisionType, string> = {
  CREATE: 'Ustvarjen',
  UPDATE: 'Spremenjen',
  DELETE: 'Izbrisan',
  RESTORE: 'Obnovljen',
  MERGE: 'Združen (ohranjen)',
  MERGED_AWAY: 'Združen v drug kontakt',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('sl-SI', { dateStyle: 'medium', timeStyle: 'short' });
}

export function HistoryPage() {
  const { cid = '' } = useParams();
  const api = useApi();
  const { workspace } = useWorkspace();
  const data = useLoad(
    async () => {
      const [contact, revisions] = await Promise.all([api.getContact(workspace.id, cid), api.listRevisions(workspace.id, cid)]);
      return { contact, revisions };
    },
    [api, workspace.id, cid],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (data.error instanceof ApiError && data.error.status === 404) return <NotFoundPage />;
  if (data.error) return <Alert>{errorText(data.error)}</Alert>;
  if (!data.data) return <p role="status">Nalaganje …</p>;
  const { contact, revisions } = data.data;
  const editor = can(workspace.role, 'EDITOR');

  async function restore(number: number) {
    setError(null);
    setMessage(null);
    try {
      await api.restoreRevision(workspace.id, cid, number, contact.version);
      setMessage(`Revizija ${number} je obnovljena kot nova revizija.`);
      await data.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <section>
      <h1>Zgodovina: {contactName(contact)}</h1>
      <p>
        <Link to={`/w/${workspace.id}/kontakti/${cid}`}>Nazaj na kontakt</Link>
      </p>
      {message && <Alert kind="info">{message}</Alert>}
      {error && <Alert>{error}</Alert>}
      <ol className="cards" reversed>
        {revisions.map((r) => {
          const previous = revisions.find((p) => p.number === r.number - 1) ?? null;
          const changes = diff(previous?.state ?? null, r.state);
          return (
            <li key={r.number} aria-label={`Revizija ${r.number}`}>
              <h2>
                Revizija {r.number}: {TYPE_LABEL[r.type]}
              </h2>
              <p className="muted">
                {r.author.displayName || r.author.email} · {formatTime(r.createdAt)}
              </p>
              {changes.length === 0 ? (
                <p>Brez sprememb podatkov.</p>
              ) : (
                <table>
                  <caption className="sr-only">Spremembe v reviziji {r.number}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Polje</th>
                      <th scope="col">Prej</th>
                      <th scope="col">Potem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c, i) => (
                      <tr key={i}>
                        <td>{c.label}</td>
                        <td>{c.old !== null ? <del className="diff-old">{c.old}</del> : '—'}</td>
                        <td>{c.new !== null ? <ins className="diff-new">{c.new}</ins> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {editor && !contact.deleted && r.number !== contact.version && (
                <button type="button" onClick={() => void restore(r.number)}>
                  Obnovi revizijo {r.number}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

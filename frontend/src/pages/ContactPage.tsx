import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, PREDEFINED_FIELDS } from '../lib/api';
import { useApi } from '../lib/context';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/messages';
import { FIELD_LABEL } from '../lib/contactForm';
import { can } from '../lib/roles';
import { Alert } from '../components/Alert';
import { NotFoundPage } from './NotFoundPage';
import { useWorkspace } from './WorkspaceLayout';

export function contactName(c: { firstName: string | null; lastName: string | null; email: string | null }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Brez imena';
}

export function ContactPage() {
  const { cid = '' } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const contact = useLoad(() => api.getContact(workspace.id, cid), [api, workspace.id, cid]);
  const [error, setError] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  if (contact.error instanceof ApiError && contact.error.status === 404) return <NotFoundPage />;
  if (contact.error) return <Alert>{errorText(contact.error)}</Alert>;
  if (!contact.data) return <p role="status">Nalaganje …</p>;
  const c = contact.data;
  const editor = can(workspace.role, 'EDITOR');

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await fn();
      if (after) after();
      else await contact.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <section>
      <h1>{contactName(c)}</h1>
      {c.deleted && (
        <Alert kind="warning">
          Kontakt je izbrisan.
          {c.mergedInto && (
            <>
              {' '}
              Združen je v <Link to={`/w/${workspace.id}/kontakti/${c.mergedInto}`}>ohranjeni kontakt</Link>.
            </>
          )}
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="actions">
        {editor && !c.deleted && (
          <>
            <Link to={`/w/${workspace.id}/kontakti/${c.id}/uredi`}>Uredi</Link>
            <button type="button" onClick={() => void act(() => api.deleteContact(workspace.id, c.id, c.version), () => navigate(`/w/${workspace.id}`))}>
              Izbriši
            </button>
          </>
        )}
        {editor && c.deleted && (
          <button type="button" onClick={() => void act(() => api.restoreContact(workspace.id, c.id))}>
            Obnovi kontakt
          </button>
        )}
        {c.deleted && can(workspace.role, 'OWNER') && !confirmPurge && (
          <button type="button" className="danger" onClick={() => setConfirmPurge(true)}>
            Trajno izbriši
          </button>
        )}
        <Link to={`/w/${workspace.id}/kontakti/${c.id}/zgodovina`}>Zgodovina sprememb</Link>
      </div>
      {confirmPurge && (
        <Alert kind="warning">
          <p>Kontakt in vse njegove revizije bodo trajno odstranjeni. Tega ni mogoče razveljaviti.</p>
          <button
            type="button"
            className="danger"
            onClick={() => void act(() => api.purgeContact(workspace.id, c.id), () => navigate(`/w/${workspace.id}/izbrisani`))}
          >
            Potrdi trajni izbris
          </button>{' '}
          <button type="button" onClick={() => setConfirmPurge(false)}>
            Prekliči
          </button>
        </Alert>
      )}
      <dl className="props">
        {PREDEFINED_FIELDS.filter((f) => c[f]).map((f) => (
          <div key={f} style={{ display: 'contents' }}>
            <dt>{FIELD_LABEL[f]}</dt>
            <dd>{c[f]}</dd>
          </div>
        ))}
      </dl>
      <h2>Atributi</h2>
      {c.attributes.length === 0 ? (
        <p>Ni atributov.</p>
      ) : (
        <dl className="props">
          {c.attributes.map((a) => (
            <div key={a.key} style={{ display: 'contents' }}>
              <dt>{a.key}</dt>
              <dd>{a.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <h2>Oznake</h2>
      {c.tags.length === 0 ? (
        <p>Ni oznak.</p>
      ) : (
        <p>
          {c.tags.map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </p>
      )}
      <p className="muted">Različica {c.version}</p>
    </section>
  );
}

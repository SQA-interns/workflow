import { useState } from 'react';
import { Link } from 'react-router';
import type { DuplicateSet, MatchKind } from '../lib/api';
import { useApi } from '../lib/context';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/messages';
import { can } from '../lib/roles';
import { Alert } from '../components/Alert';
import { MergeDialog } from '../components/MergeDialog';
import { contactName } from './ContactPage';
import { useWorkspace } from './WorkspaceLayout';

export const KIND_LABEL: Record<MatchKind, string> = { EMAIL: 'E-pošta', PHONE: 'Telefon', NAME: 'Ime in priimek' };

export function DuplicatesPage() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const sets = useLoad(() => api.listDuplicateSets(workspace.id), [api, workspace.id]);
  const [merging, setMerging] = useState<DuplicateSet | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section>
      <h1>Dvojniki</h1>
      <p>Kontakti, ki se ujemajo po e-pošti, telefonu ali imenu in priimku.</p>
      {message && <Alert kind="info">{message}</Alert>}
      {sets.error ? <Alert>{errorText(sets.error)}</Alert> : null}
      {sets.data && sets.data.length === 0 && <p>Ni najdenih dvojnikov.</p>}
      {sets.data?.map((set, i) => (
        <article key={set.contacts.map((c) => c.id).join()} className="cards" aria-label={`Skupina dvojnikov ${i + 1}`}>
          <h2>Skupina {i + 1}</h2>
          <ul>
            {set.contacts.map((c) => (
              <li key={c.id}>
                <Link to={`/w/${workspace.id}/kontakti/${c.id}`}>{contactName(c)}</Link>
                {c.email && ` · ${c.email}`}
                {c.phone && ` · ${c.phone}`}
              </li>
            ))}
          </ul>
          <p>
            Ujemanja:{' '}
            {set.matches.map((m) => (
              <span className="tag" key={m.kind + m.value}>
                {KIND_LABEL[m.kind]}: {m.value}
              </span>
            ))}
          </p>
          {can(workspace.role, 'EDITOR') && (
            <button type="button" className="primary" onClick={() => setMerging(set)}>
              Združi skupino {i + 1}
            </button>
          )}
        </article>
      ))}
      {merging && (
        <MergeDialog
          wid={workspace.id}
          contacts={merging.contacts}
          onClose={() => setMerging(null)}
          onMerged={(survivorName) => {
            setMerging(null);
            setMessage(`Kontakti so združeni v »${survivorName}«.`);
            void sets.reload();
          }}
        />
      )}
    </section>
  );
}

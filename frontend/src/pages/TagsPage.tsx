import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useApi } from '../lib/context';
import { useLoad } from '../lib/useLoad';
import { errorText, fieldErrors } from '../lib/messages';
import { can } from '../lib/roles';
import { Alert } from '../components/Alert';
import { FormField } from '../components/FormField';
import { useWorkspace } from './WorkspaceLayout';

export function TagsPage() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const editor = can(workspace.role, 'EDITOR');
  const list = useLoad(() => api.listTags(workspace.id), [api, workspace.id]);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState<string>();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const n = newName.trim();
    if (!n || /\s/.test(n) || n.length > 50) return setRenameError('Oznaka ne sme vsebovati presledkov in je dolga največ 50 znakov.');
    try {
      await api.renameTag(workspace.id, editing, n);
      setEditing(null);
      setRenameError(undefined);
      await list.reload();
    } catch (err) {
      setRenameError(fieldErrors(err).name ?? errorText(err));
    }
  }

  async function remove(name: string) {
    setError(null);
    try {
      await api.deleteTag(workspace.id, name);
      setDeleting(null);
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section>
      <h1>Oznake</h1>
      {list.error ? <Alert>{errorText(list.error)}</Alert> : null}
      {error && <Alert>{error}</Alert>}
      {list.data && list.data.length === 0 && <p>V tem delovnem prostoru še ni oznak.</p>}
      {list.data && list.data.length > 0 && (
        <table>
          <caption className="sr-only">Oznake in število kontaktov</caption>
          <thead>
            <tr>
              <th scope="col">Oznaka</th>
              <th scope="col">Kontaktov</th>
              {editor && <th scope="col">Dejanja</th>}
            </tr>
          </thead>
          <tbody>
            {list.data.map((t) => (
              <tr key={t.name}>
                <td>
                  <Link to={`/w/${workspace.id}?tag=${encodeURIComponent(t.name)}`}>{t.name}</Link>
                </td>
                <td>{t.count}</td>
                {editor && (
                  <td>
                    {editing === t.name ? (
                      <form onSubmit={rename} noValidate className="toolbar">
                        <FormField label={`Novo ime za ${t.name}`} value={newName} error={renameError} onChange={(e) => setNewName(e.target.value)} />
                        <button type="submit" className="primary">
                          Shrani ime
                        </button>
                        <button type="button" onClick={() => setEditing(null)}>
                          Prekliči
                        </button>
                      </form>
                    ) : deleting === t.name ? (
                      <span>
                        Odstranim oznako z vseh kontaktov?{' '}
                        <button type="button" className="danger" onClick={() => void remove(t.name)}>
                          Potrdi izbris {t.name}
                        </button>{' '}
                        <button type="button" onClick={() => setDeleting(null)}>
                          Prekliči
                        </button>
                      </span>
                    ) : (
                      <span className="actions">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(t.name);
                            setNewName(t.name);
                            setRenameError(undefined);
                          }}
                        >
                          Preimenuj {t.name}
                        </button>
                        <button type="button" onClick={() => setDeleting(t.name)}>
                          Izbriši {t.name}
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

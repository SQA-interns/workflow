import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useApi } from '../lib/context';
import { useLoad } from '../lib/useLoad';
import { errorText, fieldErrors } from '../lib/messages';
import { ROLE_LABEL } from '../lib/roles';
import { FormField } from '../components/FormField';
import { Alert } from '../components/Alert';

export function WorkspaceListPage() {
  const api = useApi();
  const list = useLoad(async () => {
    await api.me();
    return api.listWorkspaces();
  }, [api]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function create(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Polje je obvezno.');
    if (trimmed.length > 100) return setError('Največ 100 znakov.');
    try {
      await api.createWorkspace(trimmed);
      setName('');
      setError(undefined);
      await list.reload();
    } catch (err) {
      setError(fieldErrors(err).name ?? errorText(err));
    }
  }

  return (
    <section>
      <h1>Delovni prostori</h1>
      {list.error ? <Alert>{errorText(list.error)}</Alert> : null}
      {list.data && list.data.length === 0 && <p>Še niste član nobenega delovnega prostora.</p>}
      {list.data && list.data.length > 0 && (
        <ul className="cards">
          {list.data.map((w) => (
            <li key={w.id}>
              <Link to={`/w/${w.id}`}>{w.name}</Link> <span className="badge">{ROLE_LABEL[w.role]}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} noValidate className="inline">
        <h2>Nov delovni prostor</h2>
        <FormField label="Ime" name="name" value={name} error={error} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="primary">
          Ustvari
        </button>
      </form>
    </section>
  );
}

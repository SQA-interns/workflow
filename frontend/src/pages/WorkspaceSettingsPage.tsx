import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useApi } from '../lib/context';
import { errorText, fieldErrors } from '../lib/messages';
import { can } from '../lib/roles';
import { FormField } from '../components/FormField';
import { Alert } from '../components/Alert';
import { useWorkspace } from './WorkspaceLayout';

export function WorkspaceSettingsPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { workspace, reload } = useWorkspace();
  const [name, setName] = useState(workspace.name);
  const [nameError, setNameError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleteError, setDeleteError] = useState<string>();

  if (!can(workspace.role, 'OWNER')) return <Alert>Za to stran nimate pravic.</Alert>;

  async function rename(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (!name.trim()) return setNameError('Polje je obvezno.');
    try {
      await api.renameWorkspace(workspace.id, name.trim());
      setNameError(undefined);
      setSaved(true);
      await reload();
    } catch (err) {
      setNameError(fieldErrors(err).name ?? errorText(err));
    }
  }

  async function remove(e: FormEvent) {
    e.preventDefault();
    if (confirm !== workspace.name) return setDeleteError('Ime se ne ujema natančno z imenom delovnega prostora.');
    try {
      await api.deleteWorkspace(workspace.id, confirm);
      navigate('/');
    } catch (err) {
      setDeleteError(fieldErrors(err).confirmName ?? errorText(err));
    }
  }

  return (
    <section>
      <h1>Nastavitve</h1>
      <form onSubmit={rename} noValidate>
        <h2>Preimenuj</h2>
        <FormField label="Ime delovnega prostora" name="name" value={name} error={nameError} onChange={(e) => setName(e.target.value)} />
        {saved && <Alert kind="info">Shranjeno.</Alert>}
        <button type="submit" className="primary">
          Shrani
        </button>
      </form>
      <form onSubmit={remove} noValidate className="danger-zone">
        <h2>Izbriši delovni prostor</h2>
        <p>
          Izbris je trajen: odstrani vse kontakte, njihove revizije, oznake, člane in povabila. Za potrditev vpišite
          natančno ime <strong>{workspace.name}</strong>.
        </p>
        <FormField label="Ime za potrditev" name="confirmName" value={confirm} error={deleteError} onChange={(e) => setConfirm(e.target.value)} />
        <button type="submit" className="danger">
          Trajno izbriši
        </button>
      </form>
    </section>
  );
}

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Role } from '../lib/api';
import { useApi } from '../lib/context';
import { useLoad } from '../lib/useLoad';
import { errorText, fieldErrors } from '../lib/messages';
import { ROLE_LABEL, can } from '../lib/roles';
import { FormField } from '../components/FormField';
import { Alert } from '../components/Alert';
import { useWorkspace } from './WorkspaceLayout';

const ROLES: Role[] = ['OWNER', 'EDITOR', 'VIEWER'];

export function MembersPage() {
  const api = useApi();
  const navigate = useNavigate();
  const me = useLoad(() => api.me(), [api]);
  const { workspace } = useWorkspace();
  const isOwner = can(workspace.role, 'OWNER');
  const list = useLoad(() => api.listMembers(workspace.id), [api, workspace.id]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('VIEWER');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setActionError(null);
    try {
      await fn();
      if (after) after();
      else await list.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!email.trim()) return setErrors({ email: 'Polje je obvezno.' });
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErrors({ email: 'Vnesite veljaven e-poštni naslov.' });
    try {
      const r = await api.addMember(workspace.id, email.trim(), role);
      setMessage(r.status === 'MEMBER' ? 'Član je dodan.' : 'Povabilo je ustvarjeno; velja po prijavi s potrjeno e-pošto.');
      setEmail('');
      setErrors({});
      await list.reload();
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(Object.keys(f).length ? f : { email: errorText(err) });
    }
  }

  return (
    <section>
      <h1>Člani</h1>
      {list.error ? <Alert>{errorText(list.error)}</Alert> : null}
      {actionError && <Alert>{actionError}</Alert>}
      {list.data && (
        <table>
          <caption className="sr-only">Člani delovnega prostora</caption>
          <thead>
            <tr>
              <th scope="col">Ime</th>
              <th scope="col">E-pošta</th>
              <th scope="col">Vloga</th>
              <th scope="col">Dejanja</th>
            </tr>
          </thead>
          <tbody>
            {list.data.members.map((m) => {
              const self = me.data?.id === m.userId;
              return (
                <tr key={m.userId}>
                  <td>{m.displayName ?? '—'}</td>
                  <td>{m.email}</td>
                  <td>
                    {isOwner ? (
                      <select
                        aria-label={`Vloga za ${m.email ?? m.displayName ?? ''}`}
                        value={m.role}
                        onChange={(e) => void act(() => api.changeRole(workspace.id, m.userId, e.target.value as Role))}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABEL[m.role]
                    )}
                  </td>
                  <td>
                    {self ? (
                      <button type="button" onClick={() => void act(() => api.removeMember(workspace.id, m.userId), () => navigate('/'))}>
                        Zapusti delovni prostor
                      </button>
                    ) : (
                      isOwner && (
                        <button type="button" onClick={() => void act(() => api.removeMember(workspace.id, m.userId))}>
                          Odstrani
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <h2>Čakajoča povabila</h2>
      {list.data && list.data.invitations.length === 0 && <p>Ni čakajočih povabil.</p>}
      {list.data && list.data.invitations.length > 0 && (
        <ul className="cards">
          {list.data.invitations.map((i) => (
            <li key={i.id}>
              {i.email} <span className="badge">{ROLE_LABEL[i.role]}</span>{' '}
              {isOwner && (
                <button type="button" onClick={() => void act(() => api.cancelInvitation(workspace.id, i.id))}>
                  Prekliči povabilo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <form onSubmit={add} noValidate className="inline">
          <h2>Dodaj člana</h2>
          <FormField label="E-pošta člana" name="email" type="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
          <div className="field">
            <label htmlFor="new-role">Vloga</label>
            <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {message && <Alert kind="info">{message}</Alert>}
          <button type="submit" className="primary">
            Dodaj
          </button>
        </form>
      )}
    </section>
  );
}

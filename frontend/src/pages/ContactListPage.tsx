import { Link } from 'react-router';
import { useApi } from '../lib/context';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/messages';
import { can } from '../lib/roles';
import { Alert } from '../components/Alert';
import { contactName } from './ContactPage';
import { useWorkspace } from './WorkspaceLayout';

export function ContactListPage() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const page = useLoad(() => api.listContacts(workspace.id, {}), [api, workspace.id]);
  return (
    <section>
      <h1>Kontakti</h1>
      {can(workspace.role, 'EDITOR') && (
        <p>
          <Link to={`/w/${workspace.id}/kontakti/nov`}>Nov kontakt</Link>
        </p>
      )}
      {page.error ? <Alert>{errorText(page.error)}</Alert> : null}
      {page.data && (
        <ul className="cards">
          {page.data.items.map((c) => (
            <li key={c.id}>
              <Link to={`/w/${workspace.id}/kontakti/${c.id}`}>{contactName(c)}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

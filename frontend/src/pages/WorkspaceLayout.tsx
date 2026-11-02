import { createContext, useContext } from 'react';
import { NavLink, Outlet, useParams } from 'react-router';
import type { Workspace } from '../lib/api';
import { ApiError } from '../lib/api';
import { useApi } from '../lib/context';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/messages';
import { ROLE_LABEL, can } from '../lib/roles';
import { NotFoundPage } from './NotFoundPage';
import { Alert } from '../components/Alert';

interface WorkspaceCtx {
  workspace: Workspace;
  reload: () => Promise<void>;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const w = useContext(Ctx);
  if (!w) throw new Error('outside workspace');
  return w;
}

export function WorkspaceLayout() {
  const { wid = '' } = useParams();
  const api = useApi();
  const ws = useLoad(() => api.getWorkspace(wid), [api, wid]);

  if (ws.error instanceof ApiError && ws.error.status === 404) return <NotFoundPage />;
  if (ws.error) return <Alert>{errorText(ws.error)}</Alert>;
  if (!ws.data) return <p role="status">Nalaganje …</p>;
  const w = ws.data;
  return (
    <Ctx.Provider value={{ workspace: w, reload: ws.reload }}>
      <div className="workspace">
        <nav aria-label="Delovni prostor" className="sidenav">
          <p className="ws-name">
            {w.name} <span className="badge">{ROLE_LABEL[w.role]}</span>
          </p>
          <ul>
            <li>
              <NavLink to={`/w/${w.id}`} end>
                Kontakti
              </NavLink>
            </li>
            <li>
              <NavLink to={`/w/${w.id}/izbrisani`}>Izbrisani kontakti</NavLink>
            </li>
            <li>
              <NavLink to={`/w/${w.id}/oznake`}>Oznake</NavLink>
            </li>
            <li>
              <NavLink to={`/w/${w.id}/dvojniki`}>Dvojniki</NavLink>
            </li>
            <li>
              <NavLink to={`/w/${w.id}/clani`}>Člani</NavLink>
            </li>
            {can(w.role, 'OWNER') && (
              <li>
                <NavLink to={`/w/${w.id}/nastavitve`}>Nastavitve</NavLink>
              </li>
            )}
          </ul>
        </nav>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </Ctx.Provider>
  );
}

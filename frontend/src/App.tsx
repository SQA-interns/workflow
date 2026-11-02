import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import type { Api } from './lib/api';
import type { AuthService, AuthUser } from './lib/auth';
import { ApiContext, AuthContext, UserContext } from './lib/context';
import { Header } from './components/Header';
import { SignInPage } from './pages/SignInPage';
import { WorkspaceListPage } from './pages/WorkspaceListPage';
import { WorkspaceLayout } from './pages/WorkspaceLayout';
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { MembersPage } from './pages/MembersPage';

interface Props {
  api: Api;
  auth: AuthService;
}

/** Every page requires sign-in: without a User, every URL shows the sign-in page. */
export function App({ api, auth }: Props) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  useEffect(() => auth.onChange(setUser), [auth]);

  return (
    <ApiContext.Provider value={api}>
      <AuthContext.Provider value={auth}>
        <UserContext.Provider value={user ?? null}>
          {user === undefined ? (
            <p className="loading" role="status">
              Nalaganje …
            </p>
          ) : user === null ? (
            <SignInPage />
          ) : (
            <>
              <Header />
              <main id="main">
                <Routes>
                  <Route path="/" element={<WorkspaceListPage />} />
                  <Route path="/w/:wid" element={<WorkspaceLayout />}>
                    <Route path="clani" element={<MembersPage />} />
                    <Route path="nastavitve" element={<WorkspaceSettingsPage />} />
                  </Route>
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </main>
            </>
          )}
        </UserContext.Provider>
      </AuthContext.Provider>
    </ApiContext.Provider>
  );
}

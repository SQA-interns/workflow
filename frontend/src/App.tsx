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
import { ContactListPage } from './pages/ContactListPage';
import { ContactFormPage } from './pages/ContactFormPage';
import { ContactPage } from './pages/ContactPage';
import { TagsPage } from './pages/TagsPage';
import { HistoryPage } from './pages/HistoryPage';
import { DuplicatesPage } from './pages/DuplicatesPage';

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
                    <Route index element={<ContactListPage />} />
                    <Route path="kontakti/nov" element={<ContactFormPage />} />
                    <Route path="kontakti/:cid" element={<ContactPage />} />
                    <Route path="kontakti/:cid/uredi" element={<ContactFormPage />} />
                    <Route path="kontakti/:cid/zgodovina" element={<HistoryPage />} />
                    <Route path="izbrisani" element={<ContactListPage key="deleted" deleted />} />
                    <Route path="oznake" element={<TagsPage />} />
                    <Route path="dvojniki" element={<DuplicatesPage />} />
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

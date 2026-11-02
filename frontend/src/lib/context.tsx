import { createContext, useContext } from 'react';
import type { Api } from './api';
import type { AuthService, AuthUser } from './auth';

export const ApiContext = createContext<Api | null>(null);
export const AuthContext = createContext<AuthService | null>(null);
export const UserContext = createContext<AuthUser | null>(null);

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('ApiContext missing');
  return api;
}

export function useAuth(): AuthService {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext missing');
  return auth;
}

export function useUser(): AuthUser | null {
  return useContext(UserContext);
}

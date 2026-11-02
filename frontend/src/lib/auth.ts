// The frontend's sign-in boundary. Only firebaseAuth.ts depends on Firebase.

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

export interface AuthService {
  /** Calls back with the current User (null when signed out); returns an unsubscribe function. */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  token(): Promise<string | null>;
}

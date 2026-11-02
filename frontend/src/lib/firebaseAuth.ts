import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { AuthService } from './auth';

export interface RuntimeConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  authEmulatorUrl?: string;
}

/** Loads the Firebase configuration served next to the app (never built in, no secrets). */
export async function loadConfig(): Promise<RuntimeConfig> {
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Missing /config.json');
  return (await res.json()) as RuntimeConfig;
}

export function firebaseAuth(config: RuntimeConfig): AuthService {
  const app = initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId });
  const auth = getAuth(app);
  if (config.authEmulatorUrl) connectAuthEmulator(auth, config.authEmulatorUrl, { disableWarnings: true });
  return {
    onChange: (listener) =>
      onAuthStateChanged(auth, (u) =>
        listener(
          u
            ? { uid: u.uid, email: u.email, displayName: u.displayName, emailVerified: u.emailVerified }
            : null,
        ),
      ),
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUp: async (email, password, displayName) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) await updateProfile(cred.user, { displayName });
      await sendEmailVerification(cred.user);
      await cred.user.getIdToken(true);
    },
    signInWithGoogle: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    signOut: () => signOut(auth),
    token: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
  };
}

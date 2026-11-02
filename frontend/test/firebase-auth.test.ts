import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  const user = { uid: 'u1', email: 'a@b.si', displayName: 'Ana', emailVerified: true, getIdToken: vi.fn(async () => 'tok') };
  return {
    user,
    auth: { currentUser: null as unknown },
    initializeApp: vi.fn(() => ({ app: true })),
    getAuth: vi.fn(),
    connectAuthEmulator: vi.fn(),
    onAuthStateChanged: vi.fn(),
    signInWithEmailAndPassword: vi.fn(async () => ({ user })),
    createUserWithEmailAndPassword: vi.fn(async () => ({ user })),
    updateProfile: vi.fn(async () => {}),
    sendEmailVerification: vi.fn(async () => {}),
    signInWithPopup: vi.fn(async () => ({ user })),
    signOut: vi.fn(async () => {}),
    GoogleAuthProvider: vi.fn(),
  };
});

vi.mock('firebase/app', () => ({ initializeApp: sdk.initializeApp }));
vi.mock('firebase/auth', () => ({
  getAuth: sdk.getAuth,
  connectAuthEmulator: sdk.connectAuthEmulator,
  onAuthStateChanged: sdk.onAuthStateChanged,
  signInWithEmailAndPassword: sdk.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: sdk.createUserWithEmailAndPassword,
  updateProfile: sdk.updateProfile,
  sendEmailVerification: sdk.sendEmailVerification,
  signInWithPopup: sdk.signInWithPopup,
  signOut: sdk.signOut,
  GoogleAuthProvider: sdk.GoogleAuthProvider,
}));

import { firebaseAuth, loadConfig } from '../src/lib/firebaseAuth';

const config = { apiKey: 'k', authDomain: 'd', projectId: 'p' };

beforeEach(() => {
  vi.clearAllMocks();
  sdk.auth.currentUser = null;
  sdk.getAuth.mockReturnValue(sdk.auth);
});
afterEach(() => vi.unstubAllGlobals());

describe('loadConfig', () => {
  it('reads /config.json without caching', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(config), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadConfig()).resolves.toEqual(config);
    expect(fetchMock).toHaveBeenCalledWith('/config.json', { cache: 'no-store' });
  });

  it('fails without a configuration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(loadConfig()).rejects.toThrow('Missing /config.json');
  });
});

describe('firebaseAuth: the only code that depends on Firebase', () => {
  it('initialises the app and connects the emulator only when configured', () => {
    firebaseAuth(config);
    expect(sdk.initializeApp).toHaveBeenCalledWith({ apiKey: 'k', authDomain: 'd', projectId: 'p' });
    expect(sdk.connectAuthEmulator).not.toHaveBeenCalled();
    firebaseAuth({ ...config, authEmulatorUrl: 'http://localhost:9099' });
    expect(sdk.connectAuthEmulator).toHaveBeenCalledWith(sdk.auth, 'http://localhost:9099', { disableWarnings: true });
  });

  it('reports the signed-in User and sign-out', () => {
    const listener = vi.fn();
    let callback: (u: unknown) => void = () => {};
    const unsubscribe = vi.fn();
    sdk.onAuthStateChanged.mockImplementation((_a: unknown, cb: (u: unknown) => void) => {
      callback = cb;
      return unsubscribe;
    });
    expect(firebaseAuth(config).onChange(listener)).toBe(unsubscribe);
    callback(sdk.user);
    expect(listener).toHaveBeenLastCalledWith({ uid: 'u1', email: 'a@b.si', displayName: 'Ana', emailVerified: true });
    callback(null);
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it('signs in, signs up with a name and email verification, uses Google and signs out', async () => {
    const auth = firebaseAuth(config);
    await auth.signIn('a@b.si', 'pw');
    expect(sdk.signInWithEmailAndPassword).toHaveBeenCalledWith(sdk.auth, 'a@b.si', 'pw');
    await auth.signUp('a@b.si', 'pw', 'Ana');
    expect(sdk.createUserWithEmailAndPassword).toHaveBeenCalledWith(sdk.auth, 'a@b.si', 'pw');
    expect(sdk.updateProfile).toHaveBeenCalledWith(sdk.user, { displayName: 'Ana' });
    expect(sdk.sendEmailVerification).toHaveBeenCalledWith(sdk.user);
    expect(sdk.user.getIdToken).toHaveBeenCalledWith(true);
    sdk.updateProfile.mockClear();
    await auth.signUp('b@b.si', 'pw', '');
    expect(sdk.updateProfile).not.toHaveBeenCalled();
    await auth.signInWithGoogle();
    expect(sdk.signInWithPopup).toHaveBeenCalledWith(sdk.auth, expect.any(sdk.GoogleAuthProvider));
    await auth.signOut();
    expect(sdk.signOut).toHaveBeenCalledWith(sdk.auth);
  });

  it('gives the ID token of the current User, or null when signed out', async () => {
    const auth = firebaseAuth(config);
    await expect(auth.token()).resolves.toBeNull();
    sdk.auth.currentUser = sdk.user;
    await expect(auth.token()).resolves.toBe('tok');
  });
});

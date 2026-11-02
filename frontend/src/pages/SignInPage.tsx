import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/context';
import { FormField } from '../components/FormField';
import { Alert } from '../components/Alert';

export function SignInPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError('Vnesite e-pošto in geslo z vsaj 6 znaki.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') await auth.signIn(email.trim(), password);
      else await auth.signUp(email.trim(), password, name.trim());
    } catch {
      setError(mode === 'signIn' ? 'Prijava ni uspela. Preverite e-pošto in geslo.' : 'Registracija ni uspela.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    try {
      await auth.signInWithGoogle();
    } catch {
      setError('Prijava z Googlom ni uspela.');
    }
  }

  return (
    <main id="main" className="signin">
      <h1>{mode === 'signIn' ? 'Prijava' : 'Registracija'}</h1>
      <form onSubmit={submit} noValidate>
        {mode === 'signUp' && (
          <FormField label="Ime in priimek" name="name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <FormField
          label="E-pošta"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Geslo"
          name="password"
          type="password"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Alert>{error}</Alert>}
        <button type="submit" className="primary" disabled={busy}>
          {mode === 'signIn' ? 'Prijava' : 'Registracija'}
        </button>
      </form>
      <button type="button" onClick={() => void google()}>
        Prijava z Googlom
      </button>
      <p>
        {mode === 'signIn' ? 'Še nimate računa? ' : 'Že imate račun? '}
        <button type="button" className="link" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          {mode === 'signIn' ? 'Registracija' : 'Prijava'}
        </button>
      </p>
    </main>
  );
}

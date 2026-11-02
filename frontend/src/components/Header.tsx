import { Link } from 'react-router';
import { useAuth, useUser } from '../lib/context';

export function Header() {
  const auth = useAuth();
  const user = useUser();
  return (
    <header className="topbar">
      <a className="skip" href="#main">
        Preskoči na vsebino
      </a>
      <Link to="/" className="brand">
        Kontakti
      </Link>
      <span className="who">{user?.displayName || user?.email}</span>
      <button type="button" onClick={() => void auth.signOut()}>
        Odjava
      </button>
    </header>
  );
}

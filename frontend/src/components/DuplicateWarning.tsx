import { Link } from 'react-router';
import type { PossibleDuplicate } from '../lib/api';

const KIND: Record<string, string> = { EMAIL: 'e-pošta', PHONE: 'telefon', NAME: 'ime in priimek' };

/** The save-time warning: the Contact is saved, but looks like these existing ones. */
export function DuplicateWarning({ wid, duplicates }: { wid: string; duplicates: PossibleDuplicate[] }) {
  if (duplicates.length === 0) return null;
  return (
    <div className="alert alert-warning" role="status">
      <p>
        <strong>Kontakt je shranjen, vendar je podoben obstoječim kontaktom:</strong>
      </p>
      <ul>
        {duplicates.map((d) => (
          <li key={d.id}>
            <Link to={`/w/${wid}/kontakti/${d.id}`}>
              {[d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || 'Kontakt'}
            </Link>{' '}
            (ujema se: {d.matchKinds.map((k) => KIND[k]).join(', ')})
          </li>
        ))}
      </ul>
    </div>
  );
}

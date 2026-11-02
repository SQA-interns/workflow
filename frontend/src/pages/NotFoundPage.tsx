import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section>
      <h1>Ni najdeno</h1>
      <p>Stran ne obstaja ali do nje nimate dostopa.</p>
      <Link to="/">Na seznam delovnih prostorov</Link>
    </section>
  );
}

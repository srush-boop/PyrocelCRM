import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container">
      <div className="card">
        <h1>Fire Testing CRM Starter</h1>
        <p>Starter project for recurring weekly fire alarm and monthly emergency lighting testing.</p>
        <div className="grid grid-3">
          <Link className="card" href="/sites">Sites</Link>
          <Link className="card" href="/tasks">Tasks</Link>
          <Link className="card" href="/routes">Routes</Link>
        </div>
      </div>
    </main>
  );
}

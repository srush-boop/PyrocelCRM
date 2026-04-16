async function getRoutes() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/routes`, { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

export default async function RoutesPage() {
  const routes = await getRoutes();

  return (
    <main className="container">
      <h1>Routes</h1>
      {routes.map((route: any) => (
        <div className="card" key={route.id}>
          <h3>{route.name}</h3>
          <p>{route.description}</p>
          <p>Assigned engineers: {route.assignments?.length ?? 0}</p>
        </div>
      ))}
    </main>
  );
}

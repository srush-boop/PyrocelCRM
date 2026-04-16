async function getSites() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/sites`, { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

export default async function SitesPage() {
  const sites = await getSites();

  return (
    <main className="container">
      <h1>Sites</h1>
      {sites.map((site: any) => (
        <div className="card" key={site.id}>
          <h3>{site.name}</h3>
          <p>{site.addressLine1}</p>
          <p>{site.client?.name}</p>
        </div>
      ))}
    </main>
  );
}

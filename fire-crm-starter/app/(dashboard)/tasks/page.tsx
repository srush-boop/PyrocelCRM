async function getTasks() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/tasks`, { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

export default async function TasksPage() {
  const tasks = await getTasks();

  return (
    <main className="container">
      <h1>Tasks</h1>
      {tasks.map((task: any) => (
        <div className="card" key={task.id}>
          <h3>{task.site.name} - {task.serviceType.name}</h3>
          <p>Status: {task.status}</p>
          <p>Due: {new Date(task.dueDate).toLocaleDateString()}</p>
          <p>Engineer: {task.assignedEngineer?.name ?? 'Unassigned'}</p>
        </div>
      ))}
    </main>
  );
}

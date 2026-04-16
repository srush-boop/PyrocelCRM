import { headers } from 'next/headers';

export async function getCurrentUser() {
  const headerStore = headers();
  const userId = headerStore.get('x-user-id') || null;
  const role = headerStore.get('x-user-role') || null;
  return { id: userId, role };
}

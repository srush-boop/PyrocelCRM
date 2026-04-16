import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const routes = await prisma.route.findMany({
    include: {
      assignments: { include: { engineer: true } },
      sites: true,
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(routes);
}

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const serviceTypes = await prisma.serviceType.findMany({
    include: {
      checklists: {
        where: { active: true },
        include: { items: { orderBy: { orderIndex: 'asc' } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(serviceTypes);
}

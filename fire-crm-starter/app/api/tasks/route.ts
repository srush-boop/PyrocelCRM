import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const engineerId = request.nextUrl.searchParams.get('engineerId');
  const status = request.nextUrl.searchParams.get('status');

  const tasks = await prisma.task.findMany({
    where: {
      ...(engineerId ? { assignedEngineerId: engineerId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: {
      site: true,
      serviceType: true,
      assignedEngineer: true,
      checklistSnapshot: {
        include: {
          checklist: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
        },
      },
      responses: true,
      report: true,
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(tasks);
}

import { prisma } from '@/lib/prisma';
import { getNextDueDate } from '@/lib/frequency';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const dueServices = await prisma.siteService.findMany({
    where: {
      active: true,
      nextDueDate: { lte: today },
    },
    include: {
      site: {
        include: {
          route: { include: { assignments: true } },
        },
      },
      serviceType: {
        include: {
          checklists: {
            where: { active: true },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  const createdTaskIds: string[] = [];

  for (const siteService of dueServices) {
    const engineerId = siteService.site.route?.assignments[0]?.engineerId ?? null;
    const checklist = siteService.serviceType.checklists[0];

    const existingTask = await prisma.task.findFirst({
      where: {
        siteServiceId: siteService.id,
        dueDate: siteService.nextDueDate,
      },
    });

    if (existingTask) continue;

    const task = await prisma.task.create({
      data: {
        siteId: siteService.siteId,
        siteServiceId: siteService.id,
        serviceTypeId: siteService.serviceTypeId,
        assignedEngineerId: engineerId,
        dueDate: siteService.nextDueDate,
        checklistSnapshot: checklist
          ? {
              create: {
                checklistId: checklist.id,
              },
            }
          : undefined,
      },
    });

    createdTaskIds.push(task.id);

    await prisma.siteService.update({
      where: { id: siteService.id },
      data: {
        nextDueDate: getNextDueDate(siteService.nextDueDate, siteService.frequencyType, siteService.frequencyValue),
      },
    });
  }

  return NextResponse.json({ created: createdTaskIds.length, taskIds: createdTaskIds });
}

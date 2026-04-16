import { prisma } from '@/lib/prisma';
import { completeTaskSchema } from '@/lib/validators';
import { sendReportEmail } from '@/lib/email';
import { ChecklistResponseStatus, ReportStatus, TaskStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const payload = completeTaskSchema.parse(body);

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      site: true,
      serviceType: true,
      assignedEngineer: true,
      checklistSnapshot: {
        include: {
          checklist: { include: { items: { orderBy: { orderIndex: 'asc' } } } },
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (!task.checklistSnapshot) {
    return NextResponse.json({ error: 'Task has no checklist snapshot' }, { status: 400 });
  }

  const hasFailures = payload.responses.some((response) => response.status === ChecklistResponseStatus.FAIL);
  const taskStatus = hasFailures ? TaskStatus.ISSUE_FOUND : TaskStatus.COMPLETED;
  const reportStatus = hasFailures ? ReportStatus.ISSUES_FOUND : ReportStatus.ALL_OK;

  const updatedTask = await prisma.$transaction(async (tx) => {
    await tx.taskResponse.deleteMany({ where: { taskId: task.id } });

    await tx.taskResponse.createMany({
      data: payload.responses.map((response) => ({
        taskId: task.id,
        checklistItemId: response.checklistItemId,
        status: response.status,
        responseValue: response.responseValue,
        notes: response.notes,
      })),
    });

    if (payload.attachmentUrls?.length) {
      await tx.taskAttachment.createMany({
        data: payload.attachmentUrls.map((fileUrl) => ({ taskId: task.id, fileUrl })),
      });
    }

    await tx.report.upsert({
      where: { taskId: task.id },
      update: {
        reportStatus,
        sentToClient: false,
        sentToInternal: false,
      },
      create: {
        taskId: task.id,
        reportStatus,
      },
    });

    return tx.task.update({
      where: { id: task.id },
      data: {
        status: taskStatus,
        completedAt: new Date(),
        completedById: payload.completedById,
      },
      include: {
        site: true,
        serviceType: true,
        assignedEngineer: true,
        responses: { include: { checklistItem: true } },
        report: true,
      },
    });
  });

  const recipient =
    reportStatus === ReportStatus.ALL_OK
      ? updatedTask.site.clientEmail
      : updatedTask.site.internalNotificationEmail || process.env.INTERNAL_FALLBACK_EMAIL;

  if (recipient) {
    await sendReportEmail({
      to: recipient,
      siteName: updatedTask.site.name,
      serviceName: updatedTask.serviceType.name,
      engineerName: updatedTask.assignedEngineer?.name ?? null,
      completedAt: updatedTask.completedAt,
      reportStatus,
      checklistResults: updatedTask.responses.map((response) => ({
        item: response.checklistItem.label,
        status: response.status,
        notes: response.notes,
      })),
    });

    await prisma.report.update({
      where: { taskId: task.id },
      data:
        reportStatus === ReportStatus.ALL_OK
          ? { sentToClient: true }
          : { sentToInternal: true },
    });
  }

  return NextResponse.json(updatedTask);
}

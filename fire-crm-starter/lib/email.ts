import { ReportStatus } from '@prisma/client';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type ReportEmailPayload = {
  to: string;
  siteName: string;
  serviceName: string;
  engineerName: string | null;
  completedAt: Date | null;
  reportStatus: ReportStatus;
  checklistResults: Array<{ item: string; status: string; notes?: string | null }>;
  notesSummary?: string;
};

export async function sendReportEmail(payload: ReportEmailPayload) {
  if (!resend) {
    console.warn('Resend not configured. Skipping email send.', payload);
    return { skipped: true };
  }

  const subject = `${payload.siteName} - ${payload.serviceName} - ${payload.reportStatus === 'ALL_OK' ? 'All OK' : 'Issues Found'}`;
  const rows = payload.checklistResults
    .map((result) => `<tr><td>${result.item}</td><td>${result.status}</td><td>${result.notes ?? ''}</td></tr>`)
    .join('');

  const html = `
    <h2>${payload.siteName}</h2>
    <p><strong>Service:</strong> ${payload.serviceName}</p>
    <p><strong>Engineer:</strong> ${payload.engineerName ?? 'Unknown'}</p>
    <p><strong>Completed:</strong> ${payload.completedAt?.toISOString() ?? 'N/A'}</p>
    <p><strong>Status:</strong> ${payload.reportStatus}</p>
    <table border="1" cellspacing="0" cellpadding="6">
      <thead><tr><th>Checklist item</th><th>Result</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${payload.notesSummary ? `<p><strong>Summary:</strong> ${payload.notesSummary}</p>` : ''}
  `;

  return resend.emails.send({
    from: process.env.DEFAULT_FROM_EMAIL || 'reports@example.com',
    to: payload.to,
    subject,
    html,
  });
}

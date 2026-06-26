import { TaskResult } from '@/lib/types/database'

export interface ChecklistItem {
  id: string
  label: string
  // `passed` is only meaningful for pass/fail items. Summary/informational
  // items (numbers, text) carry `null` and must not be rendered as failures.
  passed: boolean | null
  type?: 'pass_fail' | 'text' | 'number' | 'checkbox'
  value?: boolean | string | number | null
  notes?: string
}

// Renders a single checklist row. Pass/fail items get a ✓/✗ result icon;
// informational items (e.g. damper summary counts like "Failed: 1") render
// neutrally with their value, so they are never shown as failures.
const checklistItemHtml = (item: ChecklistItem): string => {
  const isPassFail = item.type === 'pass_fail' || typeof item.passed === 'boolean'
  if (!isPassFail) {
    const hasValue = item.value !== undefined && item.value !== null && item.value !== ''
    return `
      <div class="item info">
        <strong>${item.label}${hasValue ? `: ${item.value}` : ''}</strong>
        ${item.notes ? `<p>${item.notes}</p>` : ''}
      </div>
    `
  }
  return `
    <div class="item ${item.passed ? 'pass' : 'fail'}">
      <strong>${item.passed ? '✓' : '✗'} ${item.label}</strong>
      ${item.notes ? `<p>${item.notes}</p>` : ''}
    </div>
  `
}

export interface EmailData {
  clientName: string
  clientEmail: string
  referenceNumber?: string
  siteName: string
  serviceType: string
  completedDate: string
  overallStatus: 'pass' | 'fail' | 'partial' | 'no_access'
  checklist: ChecklistItem[]
  engineerName: string
  engineerNotes?: string
  reportUrl?: string
}

// Pyrocel brand palette (shared across all transactional emails).
const BRAND = {
  red: '#c8362b',
  charcoal: '#1f2937',
  ink: '#111827',
}

// Renders a branded "Open report" call-to-action button. Returns an empty
// string when no URL is available so emails still send without a link.
const reportButton = (url?: string): string => {
  if (!url) return ''
  return `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${url}" style="display: inline-block; background: ${BRAND.red}; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 28px; border-radius: 6px;">
        Open Full Report
      </a>
    </div>
  `
}

export const generateClientPassEmail = (data: EmailData): { subject: string; html: string } => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${BRAND.red}; color: white; padding: 24px 20px; text-align: center; border-radius: 5px; }
          .brand { font-size: 22px; font-weight: bold; letter-spacing: 1px; margin: 0 0 4px; }
          .content { padding: 20px; background: #f9f9f9; margin: 20px 0; border-radius: 5px; }
          .checklist { margin: 20px 0; }
          .item { padding: 10px; border-left: 4px solid #2d8659; background: white; margin: 10px 0; }
          .pass { border-left-color: #28a745; }
          .fail { border-left-color: #dc3545; }
          .info { border-left-color: #6b7280; }
          .footer { text-align: center; color: #666; font-size: 12px; }
          .stamp { background: #28a745; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <p class="brand">PYROCEL</p>
            <h1 style="margin: 0; font-size: 18px;">Service Completed Successfully</h1>
          </div>
          
          <div class="content">
            <p>Dear ${data.clientName},</p>
            
            <p>We are pleased to inform you that your ${data.serviceType} service has been completed successfully at ${data.siteName}.</p>
            
            <h3>Service Details</h3>
            <ul>
              ${data.referenceNumber ? `<li><strong>Inspection Reference:</strong> ${data.referenceNumber}</li>` : ''}
              <li><strong>Site:</strong> ${data.siteName}</li>
              <li><strong>Service Type:</strong> ${data.serviceType}</li>
              <li><strong>Completion Date:</strong> ${data.completedDate}</li>
              <li><strong>Engineer:</strong> ${data.engineerName}</li>
            </ul>
            
            <h3>Inspection Results</h3>
            <div class="stamp">✓ ALL ITEMS PASSED</div>
            
            <div class="checklist">
              ${data.checklist.map(checklistItemHtml).join('')}
            </div>

            ${reportButton(data.reportUrl)}
            
            ${data.engineerNotes ? `
              <h3>Engineer Notes</h3>
              <p>${data.engineerNotes}</p>
            ` : ''}
            
            <p>If you have any questions about this service, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br/>The Pyrocel Team</p>
          </div>
          
          <div class="footer">
            <p>This is an automated report from Pyrocel. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `
  return {
    subject: `Service Completed: ${data.serviceType} at ${data.siteName}${data.referenceNumber ? ` (Ref ${data.referenceNumber})` : ''}`,
    html
  }
}

export const generateClientFailEmail = (data: EmailData): { subject: string; html: string } => {
  const failedItems = data.checklist.filter(item => item.passed === false)
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${BRAND.charcoal}; color: white; padding: 24px 20px; text-align: center; border-radius: 5px; }
          .brand { font-size: 22px; font-weight: bold; letter-spacing: 1px; margin: 0 0 4px; color: ${'#f87171'}; }
          .content { padding: 20px; background: #f9f9f9; margin: 20px 0; border-radius: 5px; }
          .checklist { margin: 20px 0; }
          .item { padding: 10px; border-left: 4px solid #dc3545; background: white; margin: 10px 0; }
          .pass { border-left-color: #28a745; }
          .fail { border-left-color: #dc3545; }
          .info { border-left-color: #6b7280; }
          .footer { text-align: center; color: #666; font-size: 12px; }
          .stamp { background: #dc3545; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; font-weight: bold; }
          .alert { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 12px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <p class="brand">PYROCEL</p>
            <h1 style="margin: 0; font-size: 18px;">Service Requires Attention</h1>
          </div>
          
          <div class="content">
            <p>Dear ${data.clientName},</p>
            
            <div class="alert">
              <strong>Important:</strong> Your ${data.serviceType} service at ${data.siteName} has identified items that require attention.
            </div>
            
            <h3>Service Details</h3>
            <ul>
              ${data.referenceNumber ? `<li><strong>Inspection Reference:</strong> ${data.referenceNumber}</li>` : ''}
              <li><strong>Site:</strong> ${data.siteName}</li>
              <li><strong>Service Type:</strong> ${data.serviceType}</li>
              <li><strong>Completion Date:</strong> ${data.completedDate}</li>
              <li><strong>Engineer:</strong> ${data.engineerName}</li>
            </ul>
            
            <h3>Inspection Results</h3>
            <div class="stamp">⚠ ITEMS REQUIRE ATTENTION</div>
            
            <div class="checklist">
              ${data.checklist.map(checklistItemHtml).join('')}
            </div>
            
            ${data.engineerNotes ? `
              <h3>Engineer Notes</h3>
              <p>${data.engineerNotes}</p>
            ` : ''}
            
            ${reportButton(data.reportUrl)}

            <h3>Next Steps</h3>
            <p>Please contact us as soon as possible to discuss the failed items and schedule any necessary follow-up work.</p>
            
            <p>Best regards,<br/>The Pyrocel Team</p>
          </div>
          
          <div class="footer">
            <p>This is an automated report from Pyrocel. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `
  return {
    subject: `Attention Required: ${data.serviceType} at ${data.siteName}${data.referenceNumber ? ` (Ref ${data.referenceNumber})` : ''}`,
    html
  }
}

// Sent when the engineer attended but could not gain access to the site. This
// is deliberately neutral — it is not a failure or a defect notice, it simply
// informs the client that the visit could not be completed and will be
// re-attended.
export const generateClientNoAccessEmail = (data: EmailData): { subject: string; html: string } => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${BRAND.charcoal}; color: white; padding: 24px 20px; text-align: center; border-radius: 5px; }
          .brand { font-size: 22px; font-weight: bold; letter-spacing: 1px; margin: 0 0 4px; }
          .content { padding: 20px; background: #f9f9f9; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; color: #666; font-size: 12px; }
          .stamp { background: #d97706; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; font-weight: bold; }
          .notice { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 12px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <p class="brand">PYROCEL</p>
            <h1 style="margin: 0; font-size: 18px;">Visit Could Not Be Completed</h1>
          </div>

          <div class="content">
            <p>Dear ${data.clientName},</p>

            <div class="notice">
              <strong>No access:</strong> Our engineer attended ${data.siteName} for the scheduled
              ${data.serviceType} but was unable to gain access to carry out the service.
            </div>

            <h3>Visit Details</h3>
            <ul>
              ${data.referenceNumber ? `<li><strong>Reference:</strong> ${data.referenceNumber}</li>` : ''}
              <li><strong>Site:</strong> ${data.siteName}</li>
              <li><strong>Service Type:</strong> ${data.serviceType}</li>
              <li><strong>Attended Date:</strong> ${data.completedDate}</li>
              <li><strong>Engineer:</strong> ${data.engineerName}</li>
            </ul>

            <div class="stamp">NO ACCESS — SERVICE NOT CARRIED OUT</div>

            ${data.engineerNotes ? `
              <h3>Engineer Notes</h3>
              <p>${data.engineerNotes}</p>
            ` : ''}

            ${reportButton(data.reportUrl)}

            <h3>Next Steps</h3>
            <p>Please contact us to arrange access so we can re-attend and complete the service. This visit has not been recorded as a service failure.</p>

            <p>Best regards,<br/>The Pyrocel Team</p>
          </div>

          <div class="footer">
            <p>This is an automated report from Pyrocel. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `
  return {
    subject: `No Access: ${data.serviceType} at ${data.siteName}${data.referenceNumber ? ` (Ref ${data.referenceNumber})` : ''}`,
    html
  }
}

export const generateInternalAlertEmail = (data: EmailData): { subject: string; html: string } => {
  const failedItems = data.checklist.filter(item => item.passed === false)
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${BRAND.charcoal}; color: white; padding: 24px 20px; text-align: center; border-radius: 5px; }
          .brand { font-size: 22px; font-weight: bold; letter-spacing: 1px; margin: 0 0 4px; color: #f87171; }
          .content { padding: 20px; background: #f9f9f9; margin: 20px 0; border-radius: 5px; }
          .checklist { margin: 20px 0; }
          .item { padding: 10px; border-left: 4px solid #dc3545; background: white; margin: 10px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background: #f5f5f5; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <p class="brand">PYROCEL</p>
            <h1 style="margin: 0; font-size: 18px;">Internal Alert: Failed Inspection Items</h1>
          </div>
          
          <div class="content">
            <h3>Failed Items Report</h3>
            <table>
              <tr>
                <th>Reference</th>
                <th>Site</th>
                <th>Service Type</th>
                <th>Client</th>
                <th>Engineer</th>
                <th>Date</th>
              </tr>
              <tr>
                <td>${data.referenceNumber || '-'}</td>
                <td>${data.siteName}</td>
                <td>${data.serviceType}</td>
                <td>${data.clientName}</td>
                <td>${data.engineerName}</td>
                <td>${data.completedDate}</td>
              </tr>
            </table>
            
            <h3>Failed Items (${failedItems.length})</h3>
            <div class="checklist">
              ${failedItems.map(item => `
                <div class="item">
                  <strong>✗ ${item.label}</strong>
                  ${item.notes ? `<p>${item.notes}</p>` : ''}
                </div>
              `).join('')}
            </div>
            
            ${data.engineerNotes ? `
              <h3>Engineer Notes</h3>
              <p>${data.engineerNotes}</p>
            ` : ''}
            
            ${reportButton(data.reportUrl)}

            <h3>Action Required</h3>
            <p>Please review the failed items and contact the client to schedule follow-up work or issue corrective actions.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated internal alert.</p>
          </div>
        </div>
      </body>
    </html>
  `
  return {
    subject: `[ALERT] Failed Inspection Items - ${data.siteName}${data.referenceNumber ? ` (Ref ${data.referenceNumber})` : ''}`,
    html
  }
}

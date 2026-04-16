import { TaskResult } from '@/lib/types/database'

export interface ChecklistItem {
  id: string
  label: string
  passed: boolean
  notes?: string
}

export interface EmailData {
  clientName: string
  clientEmail: string
  siteName: string
  serviceType: string
  completedDate: string
  overallStatus: 'pass' | 'fail' | 'partial'
  checklist: ChecklistItem[]
  engineerName: string
  engineerNotes?: string
}

export const generateClientPassEmail = (data: EmailData): { subject: string; html: string } => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1a4d2e; color: white; padding: 20px; text-align: center; border-radius: 5px; }
          .content { padding: 20px; background: #f9f9f9; margin: 20px 0; border-radius: 5px; }
          .checklist { margin: 20px 0; }
          .item { padding: 10px; border-left: 4px solid #2d8659; background: white; margin: 10px 0; }
          .pass { border-left-color: #28a745; }
          .fail { border-left-color: #dc3545; }
          .footer { text-align: center; color: #666; font-size: 12px; }
          .stamp { background: #28a745; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Service Completed Successfully</h1>
          </div>
          
          <div class="content">
            <p>Dear ${data.clientName},</p>
            
            <p>We are pleased to inform you that your ${data.serviceType} service has been completed successfully at ${data.siteName}.</p>
            
            <h3>Service Details</h3>
            <ul>
              <li><strong>Site:</strong> ${data.siteName}</li>
              <li><strong>Service Type:</strong> ${data.serviceType}</li>
              <li><strong>Completion Date:</strong> ${data.completedDate}</li>
              <li><strong>Engineer:</strong> ${data.engineerName}</li>
            </ul>
            
            <h3>Inspection Results</h3>
            <div class="stamp">✓ ALL ITEMS PASSED</div>
            
            <div class="checklist">
              ${data.checklist.map(item => `
                <div class="item pass">
                  <strong>✓ ${item.label}</strong>
                  ${item.notes ? `<p>${item.notes}</p>` : ''}
                </div>
              `).join('')}
            </div>
            
            ${data.engineerNotes ? `
              <h3>Engineer Notes</h3>
              <p>${data.engineerNotes}</p>
            ` : ''}
            
            <p>If you have any questions about this service, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br/>PyrocelCRM Team</p>
          </div>
          
          <div class="footer">
            <p>This is an automated report. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `
  return {
    subject: `Service Completed: ${data.serviceType} at ${data.siteName}`,
    html
  }
}

export const generateClientFailEmail = (data: EmailData): { subject: string; html: string } => {
  const failedItems = data.checklist.filter(item => !item.passed)
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px; }
          .content { padding: 20px; background: #f9f9f9; margin: 20px 0; border-radius: 5px; }
          .checklist { margin: 20px 0; }
          .item { padding: 10px; border-left: 4px solid #dc3545; background: white; margin: 10px 0; }
          .pass { border-left-color: #28a745; }
          .fail { border-left-color: #dc3545; }
          .footer { text-align: center; color: #666; font-size: 12px; }
          .stamp { background: #dc3545; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; font-weight: bold; }
          .alert { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 12px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Service Requires Attention</h1>
          </div>
          
          <div class="content">
            <p>Dear ${data.clientName},</p>
            
            <div class="alert">
              <strong>Important:</strong> Your ${data.serviceType} service at ${data.siteName} has identified items that require attention.
            </div>
            
            <h3>Service Details</h3>
            <ul>
              <li><strong>Site:</strong> ${data.siteName}</li>
              <li><strong>Service Type:</strong> ${data.serviceType}</li>
              <li><strong>Completion Date:</strong> ${data.completedDate}</li>
              <li><strong>Engineer:</strong> ${data.engineerName}</li>
            </ul>
            
            <h3>Inspection Results</h3>
            <div class="stamp">⚠ ITEMS REQUIRE ATTENTION</div>
            
            <div class="checklist">
              ${data.checklist.map(item => `
                <div class="item ${item.passed ? 'pass' : 'fail'}">
                  <strong>${item.passed ? '✓' : '✗'} ${item.label}</strong>
                  ${item.notes ? `<p>${item.notes}</p>` : ''}
                </div>
              `).join('')}
            </div>
            
            ${data.engineerNotes ? `
              <h3>Engineer Notes</h3>
              <p>${data.engineerNotes}</p>
            ` : ''}
            
            <h3>Next Steps</h3>
            <p>Please contact us as soon as possible to discuss the failed items and schedule any necessary follow-up work.</p>
            
            <p>Best regards,<br/>PyrocelCRM Team</p>
          </div>
          
          <div class="footer">
            <p>This is an automated report. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `
  return {
    subject: `Attention Required: ${data.serviceType} at ${data.siteName}`,
    html
  }
}

export const generateInternalAlertEmail = (data: EmailData): { subject: string; html: string } => {
  const failedItems = data.checklist.filter(item => !item.passed)
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px; }
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
            <h1>Internal Alert: Failed Inspection Items</h1>
          </div>
          
          <div class="content">
            <h3>Failed Items Report</h3>
            <table>
              <tr>
                <th>Site</th>
                <th>Service Type</th>
                <th>Client</th>
                <th>Engineer</th>
                <th>Date</th>
              </tr>
              <tr>
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
    subject: `[ALERT] Failed Inspection Items - ${data.siteName}`,
    html
  }
}

# PyrocelCRM - Fire & Emergency Lighting Testing Management System

A comprehensive CRM for managing fire alarm and emergency lighting testing services. Built with Next.js 15, Supabase, and Tailwind CSS.

## Features

### Admin Dashboard
- **Site Management**: Add, edit, and organize client sites with contact information
- **Route Management**: Group sites by geographic area and assign engineers
- **Engineer Management**: View all engineers, their assigned routes, and availability
- **Service Types**: Define custom service types (Fire Alarm Testing, Emergency Lighting, etc.)
- **Checklist Templates**: Create custom inspection checklists for each service type
- **Task Scheduling**: Create and assign service tasks to specific engineers
- **Reports**: View all completed service reports and resend emails

### Engineer Interface
- **My Tasks**: See all assigned tasks with site details and scheduling information
- **Task Execution**: Complete service visits with mobile-optimized interface
- **Checklist Completion**: Check off items as inspections are completed
- **Photo Uploads**: Attach photos of issues or compliance documentation
- **Pass/Fail Marking**: Mark each checklist item as pass/fail with notes
- **Digital Signature**: Capture client signature for completed work

### Automated Reporting
- **Client Reports**: Automatically send professional reports to clients after task completion
- **Pass Reports**: When all items pass, clients receive a success confirmation
- **Failure Alerts**: When any items fail, clients get detailed reports with recommendations
- **Internal Alerts**: Management team receives notifications of failed inspections
- **Email Resend**: Manually resend any report email from the Reports page

## Technology Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Node.js, Supabase PostgreSQL
- **Authentication**: Supabase Auth with email/password
- **Database**: Supabase with Row-Level Security (RLS)
- **Email**: Resend for transactional emails
- **File Storage**: Future support for photo uploads

## Getting Started

### Prerequisites
- Node.js 18+ (v0 automatically manages dependencies)
- A Supabase account (free tier available)
- A Resend account for email sending (optional, free tier available)

### Setup Instructions

1. **Connect Supabase Integration** (in v0 Settings)
   - The database schema is pre-configured with all necessary tables
   - All tables have Row-Level Security policies configured
   - Default service types are pre-populated

2. **Configure Environment Variables** (in v0 Settings → Vars)
   ```
   RESEND_API_KEY=re_[your-key]
   RESEND_FROM_EMAIL=noreply@yourdomain.com
   INTERNAL_ALERT_EMAILS=admin@company.com
   ```
   
   See [ENV_SETUP.md](./ENV_SETUP.md) for detailed instructions.

3. **Start the Development Server**
   - v0 automatically starts the dev server
   - Preview updates in real-time

4. **Create Your First User**
   - Navigate to `/auth/sign-up`
   - Sign up with email and password
   - Confirm your email address
   - Create an admin account (default role is engineer)

## User Roles

### Admin
Full access to all features:
- Manage sites, routes, engineers
- Create and edit service types
- Build custom checklists
- Create and assign tasks
- View all reports
- Access settings

### Engineer
Field staff interface:
- View assigned tasks
- Execute service visits
- Complete checklists
- Upload photos
- Capture signatures
- View own task history

### Office
Administrative support:
- Manage sites and routes
- Assign tasks to engineers
- View reports
- Schedule services

## Database Schema

### Core Tables
- **profiles**: User accounts with role-based access
- **service_types**: Available service types (Fire Alarm, Emergency Lighting, etc.)
- **routes**: Geographic groupings of sites with engineer assignments
- **sites**: Client site information and contact details
- **site_services**: Links sites to services with frequency scheduling
- **tasks**: Individual service visits with scheduling and status
- **checklist_templates**: Custom inspection checklists by service type
- **task_results**: Completed task results with checklist data and photos

All tables include Row-Level Security (RLS) policies ensuring users only see their authorized data.

## Workflow

### Typical Service Workflow

1. **Admin Creates Site**
   - Add site address, contact information
   - Assign to a route

2. **Admin Adds Services to Site**
   - Select which services the site needs
   - Set service frequency (e.g., annual, quarterly)

3. **Office Schedules Task**
   - Create task for specific date
   - Assign to engineer with assigned route

4. **Engineer Completes Task**
   - Access mobile interface
   - Check off each checklist item
   - Upload photos as needed
   - Mark pass/fail status
   - Capture client signature

5. **Automatic Report Sent**
   - If all pass: Client receives success report
   - If any fail: Client and internal team notified
   - Report includes photos, engineer notes, and recommendations

6. **Office Follows Up**
   - View reports from Reports page
   - Resend reports if needed
   - Track follow-up actions

## Deployment

### Deploy to Vercel

1. Push code to GitHub
2. Connect GitHub repository in v0 Settings
3. Deploy using the Publish button
4. Configure environment variables in Vercel project settings
5. Verify email configuration with test send

## API Endpoints

### POST /api/send-report
Sends a service completion report email.

**Request Body:**
```json
{
  "taskResultId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "email-message-id"
}
```

## Security Considerations

- All authentication handled by Supabase Auth
- Row-Level Security (RLS) policies enforce data access rules
- Service role key only used on server side
- Client-side uses restricted anon key
- Password hashing handled by Supabase
- Email templates do not include sensitive data
- Photo uploads are user-controlled

## Troubleshooting

### Can't sign up?
- Check that email confirmation is enabled in Supabase Auth settings
- Look for confirmation email in spam folder
- Verify email address is correct

### Tasks not showing?
- Verify engineer is assigned to a route
- Check task is assigned to current logged-in user
- Ensure task date hasn't passed or status isn't cancelled

### Emails not sending?
- Verify `RESEND_API_KEY` is configured
- Check that `RESEND_FROM_EMAIL` is a valid format
- Ensure client contact email is saved in site details
- Check console for error messages

### Missing data after sign up?
- Log out and back in to refresh session
- Check user role in database
- Verify RLS policies if using database directly

## Future Enhancements

- File upload system for photo storage
- Advanced reporting and analytics
- Service history timeline view
- Preventive maintenance scheduling
- Integration with accounting software
- Mobile app for offline task execution
- Real-time task status updates
- Client portal for viewing reports

## Support

For issues or feature requests, check the logs in the v0 console or contact your administrator.

## License

Created with v0 for PyrocelCRM.

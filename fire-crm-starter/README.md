# Fire Testing CRM Starter

Starter project for a Vercel-hosted CRM that manages recurring fire alarm and emergency lighting tests.

## Stack
- Next.js 14 App Router
- Prisma + PostgreSQL
- Vercel Cron
- Resend for email

## Quick start
1. Copy `.env.example` to `.env`
2. Install dependencies: `npm install`
3. Generate Prisma client: `npx prisma generate`
4. Run migrations: `npx prisma migrate dev --name init`
5. Seed sample data: `npm run prisma:seed`
6. Start locally: `npm run dev`

## Core routes
- `GET /api/sites`
- `POST /api/sites`
- `GET /api/service-types`
- `GET /api/routes`
- `GET /api/tasks?engineerId=...`
- `POST /api/tasks/[id]/complete`
- `POST /api/cron/generate-tasks`

## Cron setup
Create a Vercel cron job that calls:
- `/api/cron/generate-tasks`

Include header:
- `Authorization: Bearer <CRON_SECRET>`

## Notes
- Auth is intentionally left as a thin placeholder so your developer can wire in Auth.js / SSO cleanly.
- Report emails are sent to the client when every checklist item passes.
- If any checklist item fails, the report goes to the site internal notification email or fallback internal email.

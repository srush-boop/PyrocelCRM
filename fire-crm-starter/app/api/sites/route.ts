import { prisma } from '@/lib/prisma';
import { createSiteSchema } from '@/lib/validators';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const sites = await prisma.site.findMany({
    include: {
      client: true,
      route: true,
      services: { include: { serviceType: true } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(sites);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const payload = createSiteSchema.parse(body);

  const site = await prisma.site.create({
    data: {
      clientId: payload.clientId,
      name: payload.name,
      addressLine1: payload.addressLine1,
      addressLine2: payload.addressLine2,
      city: payload.city,
      postcode: payload.postcode,
      notes: payload.notes,
      clientEmail: payload.clientEmail,
      internalNotificationEmail: payload.internalNotificationEmail,
      routeId: payload.routeId,
      services: {
        create: payload.services.map((service) => ({
          serviceTypeId: service.serviceTypeId,
          frequencyType: service.frequencyType,
          frequencyValue: service.frequencyValue,
          nextDueDate: new Date(service.nextDueDate),
        })),
      },
    },
    include: {
      services: true,
      client: true,
      route: true,
    },
  });

  return NextResponse.json(site, { status: 201 });
}

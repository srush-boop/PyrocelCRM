import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const clients = await prisma.client.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(clients);
}

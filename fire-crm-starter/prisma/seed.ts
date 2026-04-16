import { PrismaClient, FrequencyType, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const engineer = await prisma.user.upsert({
    where: { email: 'engineer@example.com' },
    update: {},
    create: {
      name: 'Demo Engineer',
      email: 'engineer@example.com',
      role: UserRole.ENGINEER,
    },
  });

  const client = await prisma.client.upsert({
    where: { id: 'seed-client-1' },
    update: {},
    create: {
      id: 'seed-client-1',
      name: 'Example Client Ltd',
      primaryContactName: 'Jane Client',
      primaryContactEmail: 'client@example.com',
    },
  });

  const route = await prisma.route.upsert({
    where: { name: 'North Route' },
    update: {},
    create: { name: 'North Route', description: 'Demo route' },
  });

  await prisma.routeAssignment.upsert({
    where: { routeId_engineerId: { routeId: route.id, engineerId: engineer.id } },
    update: {},
    create: { routeId: route.id, engineerId: engineer.id },
  });

  const fireAlarm = await prisma.serviceType.upsert({
    where: { name: 'Weekly Fire Alarm Test' },
    update: {},
    create: {
      name: 'Weekly Fire Alarm Test',
      defaultFrequency: FrequencyType.WEEKLY,
      description: 'Weekly user fire alarm test',
    },
  });

  const emergencyLighting = await prisma.serviceType.upsert({
    where: { name: 'Monthly Emergency Lighting Test' },
    update: {},
    create: {
      name: 'Monthly Emergency Lighting Test',
      defaultFrequency: FrequencyType.MONTHLY,
      description: 'Monthly emergency lighting function test',
    },
  });

  const site = await prisma.site.create({
    data: {
      clientId: client.id,
      name: 'Cragside House',
      addressLine1: '1 Example Street',
      city: 'Newcastle upon Tyne',
      postcode: 'NE1 1AA',
      clientEmail: 'client@example.com',
      internalNotificationEmail: 'service@yourcompany.co.uk',
      routeId: route.id,
      services: {
        create: [
          {
            serviceTypeId: fireAlarm.id,
            frequencyType: FrequencyType.WEEKLY,
            nextDueDate: new Date(),
          },
          {
            serviceTypeId: emergencyLighting.id,
            frequencyType: FrequencyType.MONTHLY,
            nextDueDate: new Date(),
          },
        ],
      },
    },
  });

  for (const [serviceType, checklistName, items] of [
    [fireAlarm, 'Weekly Fire Alarm Checklist', ['Panel normal', 'Call point tested', 'Sounders operated', 'Panel reset']],
    [emergencyLighting, 'Monthly Emergency Lighting Checklist', ['Key switch test completed', 'Luminaires illuminated', 'Fittings restored', 'Defects recorded']],
  ] as const) {
    const checklist = await prisma.checklist.create({
      data: {
        serviceTypeId: serviceType.id,
        name: checklistName,
        version: 1,
        active: true,
        items: {
          create: items.map((label, index) => ({
            label,
            orderIndex: index + 1,
          })),
        },
      },
    });
    console.log(`Created checklist ${checklist.name} for site ${site.name}`);
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

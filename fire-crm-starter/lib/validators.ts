import { FrequencyType, ChecklistResponseStatus } from '@prisma/client';
import { z } from 'zod';

export const createSiteSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  notes: z.string().optional(),
  clientEmail: z.string().email().optional(),
  internalNotificationEmail: z.string().email().optional(),
  routeId: z.string().optional(),
  services: z.array(
    z.object({
      serviceTypeId: z.string().min(1),
      frequencyType: z.nativeEnum(FrequencyType),
      frequencyValue: z.number().int().positive().optional(),
      nextDueDate: z.string().datetime(),
    })
  ),
});

export const completeTaskSchema = z.object({
  completedById: z.string().min(1),
  responses: z.array(
    z.object({
      checklistItemId: z.string().min(1),
      status: z.nativeEnum(ChecklistResponseStatus),
      responseValue: z.string().optional(),
      notes: z.string().optional(),
    })
  ).min(1),
  attachmentUrls: z.array(z.string().url()).optional(),
});

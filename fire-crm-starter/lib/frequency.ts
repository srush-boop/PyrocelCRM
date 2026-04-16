import { FrequencyType } from '@prisma/client';

export function getNextDueDate(current: Date, frequencyType: FrequencyType, frequencyValue?: number | null) {
  const next = new Date(current);

  switch (frequencyType) {
    case FrequencyType.WEEKLY:
      next.setDate(next.getDate() + 7);
      return next;
    case FrequencyType.FORTNIGHTLY:
      next.setDate(next.getDate() + 14);
      return next;
    case FrequencyType.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      return next;
    case FrequencyType.CUSTOM_DAYS:
      next.setDate(next.getDate() + (frequencyValue || 7));
      return next;
    default:
      return next;
  }
}

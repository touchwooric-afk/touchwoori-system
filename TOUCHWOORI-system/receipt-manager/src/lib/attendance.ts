import type { Role } from '@/types';

export const ATTENDANCE_CHECK_ROLES: Role[] = ['master', 'sub_master', 'accountant', 'teacher'];
export const ATTENDANCE_MANAGE_ROLES: Role[] = ['master', 'sub_master', 'accountant'];
export const ATTENDANCE_CROSS_DEPT_ROLES: Role[] = ['master', 'sub_master'];

export function formatAttendanceWeekLabel(dateString: string): string {
  const [, month, day] = dateString.split('-').map(Number);
  const occurrence = Math.ceil(day / 7);
  return `${month}월 ${occurrence}주차`;
}

export function nextSundayInKorea(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const daysUntilSunday = (7 - localDate.getUTCDay()) % 7;
  localDate.setUTCDate(localDate.getUTCDate() + daysUntilSunday);
  return localDate.toISOString().slice(0, 10);
}

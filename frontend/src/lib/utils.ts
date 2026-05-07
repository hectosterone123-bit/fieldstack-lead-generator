import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATE_TZ: Record<string, string> = {
  AL:'America/Chicago', AK:'America/Anchorage', AZ:'America/Phoenix',
  AR:'America/Chicago', CA:'America/Los_Angeles', CO:'America/Denver',
  CT:'America/New_York', DE:'America/New_York', FL:'America/New_York',
  GA:'America/New_York', HI:'Pacific/Honolulu', ID:'America/Boise',
  IL:'America/Chicago', IN:'America/Indiana/Indianapolis', IA:'America/Chicago',
  KS:'America/Chicago', KY:'America/New_York', LA:'America/Chicago',
  ME:'America/New_York', MD:'America/New_York', MA:'America/New_York',
  MI:'America/Detroit', MN:'America/Chicago', MS:'America/Chicago',
  MO:'America/Chicago', MT:'America/Denver', NE:'America/Chicago',
  NV:'America/Los_Angeles', NH:'America/New_York', NJ:'America/New_York',
  NM:'America/Denver', NY:'America/New_York', NC:'America/New_York',
  ND:'America/Chicago', OH:'America/New_York', OK:'America/Chicago',
  OR:'America/Los_Angeles', PA:'America/New_York', RI:'America/New_York',
  SC:'America/New_York', SD:'America/Chicago', TN:'America/Chicago',
  TX:'America/Chicago', UT:'America/Denver', VT:'America/New_York',
  VA:'America/New_York', WA:'America/Los_Angeles', WV:'America/New_York',
  WI:'America/Chicago', WY:'America/Denver',
};

export function getCallWindow(state?: string | null): 'prime' | 'ok' | 'off' {
  const tz = STATE_TZ[(state || '').toUpperCase()] || 'America/Chicago';
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()),
    10
  );
  if ((hour >= 8 && hour < 10) || (hour >= 16 && hour < 18)) return 'prime';
  if (hour >= 10 && hour < 16) return 'ok';
  return 'off';
}

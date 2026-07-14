export const CAL = {
  origin: process.env.NEXT_PUBLIC_CAL_ORIGIN ?? 'https://cal.stryvsocietyfit.com',
  username: process.env.NEXT_PUBLIC_CAL_USERNAME ?? 'stryv',
  events: {
    free: process.env.NEXT_PUBLIC_CAL_EVENT_FREE ?? 'free-first-session',
    coaching: process.env.NEXT_PUBLIC_CAL_EVENT_COACHING ?? 'coaching-session',
    premium: process.env.NEXT_PUBLIC_CAL_EVENT_PREMIUM ?? 'premium-session',
  },
} as const;

export function eventForTier(tier: 'free' | 'coaching' | 'premium'): string {
  return `${CAL.username}/${CAL.events[tier]}`;
}

export function eventLink(event: keyof typeof CAL.events): string {
  return `${CAL.username}/${CAL.events[event]}`;
}

export function eventUrl(event: keyof typeof CAL.events): string {
  return `${CAL.origin.replace(/\/$/, '')}/${eventLink(event)}`;
}

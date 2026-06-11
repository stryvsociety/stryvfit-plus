import type { Metadata } from 'next';

export const metadata: Metadata = {
  applicationName: 'StryvAdmin',
  manifest: null,
  appleWebApp: null,
  other: {
    'apple-mobile-web-app-title': 'StryvAdmin',
  },
};

export default function AdminSignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}

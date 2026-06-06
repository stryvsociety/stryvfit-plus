import type { Metadata } from 'next';

export const metadata: Metadata = {
  applicationName: 'StryvAdmin',
  manifest: '/admin-manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'StryvAdmin' },
  other: {
    'apple-mobile-web-app-title': 'StryvAdmin',
  },
};

export default function AdminSignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Anton, Athiti, Cinzel, DM_Sans, Inter, Karma, Offside, Oswald, Overpass } from 'next/font/google';
import { ErrorBoundary } from '@/components/incidents/ErrorBoundary';
import LenisProvider from '@/components/landing/LenisProvider';
import { BugZapNotice } from '@/components/pwa/BugZapNotice';
import { PWAClient } from '@/components/pwa/PWAClient';
import { clerkProxyUrl } from '@/lib/hosts';
import '../styles/globals.css';

const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton', display: 'swap' });
const athiti = Athiti({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-athiti', display: 'swap' });
const cinzel = Cinzel({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-cinzel', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dm-sans', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter', display: 'swap' });
const karma = Karma({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-karma', display: 'swap' });
const offside = Offside({ subsets: ['latin'], weight: '400', variable: '--font-offside', display: 'swap' });
const oswald = Oswald({ subsets: ['latin'], weight: '500', variable: '--font-oswald', display: 'swap' });
const overpass = Overpass({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-overpass', display: 'swap' });
const logoAssetVersion = 'v=20260603-polish';
const ogImage = '/stryv-social-preview-20260603.png';
const icon192 = `/icons/icon-192.png?${logoAssetVersion}`;
const icon512 = `/icons/icon-512.png?${logoAssetVersion}`;

export const metadata: Metadata = {
  metadataBase: new URL('https://stryvsocietyfit.com'),
  title: 'StryvFit+',
  applicationName: 'StryvFit+',
  description: 'Train with Intention. Build with Purpose.',
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'StryvFit+',
    description: 'Train with Intention. Build with Purpose.',
    url: 'https://stryvsocietyfit.com',
    siteName: 'Stryv Society Fitness',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'Stryv Society Fitness logo on a black background',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StryvFit+',
    description: 'Train with Intention. Build with Purpose.',
    images: [ogImage],
  },
  icons: {
    icon: [
      { url: icon192, sizes: '192x192', type: 'image/png' },
      { url: icon512, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: icon192, sizes: '192x192', type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'StryvFit+' },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': 'StryvFit+',
    'msapplication-TileColor': '#070E13',
  },
};

export const viewport: Viewport = {
  themeColor: '#070E13',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={[
        anton.variable,
        athiti.variable,
        cinzel.variable,
        dmSans.variable,
        inter.variable,
        karma.variable,
        offside.variable,
        oswald.variable,
        overpass.variable,
      ].join(' ')}
    >
      <head>
        <link rel="apple-touch-icon" href={icon192} />
        {/* iOS splash screen meta */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="min-h-dvh ios-safe-top ios-safe-bottom">
        <ClerkProvider proxyUrl={clerkProxyUrl()}>
          <ErrorBoundary>
            <LenisProvider>{children}</LenisProvider>
          </ErrorBoundary>
          <PWAClient />
          <BugZapNotice />
        </ClerkProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'CNIC Print Studio - Print CNIC Cards in Exact Size',
    template: '%s | CNIC Print Studio',
  },
  description:
    'CNIC Print Studio helps you upload, crop, and print Pakistani CNIC front and back sides in exact 85.6 x 54 mm size with duplex-ready PDF layout for A4, A5, and A6 pages.',
  applicationName: 'CNIC Print Studio',
  keywords: [
    'CNIC print',
    'Pakistan CNIC card print',
    'CNIC size 85.6x54 mm',
    'duplex CNIC PDF',
    'A4 CNIC printing',
    'A5 CNIC printing',
    'A6 CNIC printing',
    'CNIC crop tool',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    title: 'CNIC Print Studio - Print CNIC Cards in Exact Size',
    description:
      'Generate duplex-ready CNIC print sheets with accurate card dimensions and clean layouts for A4, A5, and A6.',
    siteName: 'CNIC Print Studio',
    locale: 'en_PK',
  },
  twitter: {
    card: 'summary',
    title: 'CNIC Print Studio - Print CNIC Cards in Exact Size',
    description:
      'Upload, crop, and export duplex-ready CNIC PDFs with exact dimensions for high-quality printing.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

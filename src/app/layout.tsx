import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { poppins } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trade Weft | B2B Barter Marketplace',
  description: 'Trade services, build trust. The B2B barter marketplace for Africa.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-background font-sans text-ink antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

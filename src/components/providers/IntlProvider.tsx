'use client';

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';

export interface IntlProviderProps {
  children: React.ReactNode;
  messages: Record<string, any>;
  locale?: string;
}
/*nanjkkkkjhhhhd*/
export function IntlProvider({
  children,
  messages,
  locale = 'en',
}: IntlProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

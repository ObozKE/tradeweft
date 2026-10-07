import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // Phase 1 defaults to English, structured for future dynamic locale detection
  const locale = 'en';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

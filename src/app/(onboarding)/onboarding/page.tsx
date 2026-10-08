import { getTranslations } from 'next-intl/server';
import { requirePendingOnboardingUser } from '@/server/dal';
import { getActiveCountries, getLocationsByCountry } from '@/features/onboarding/queries/locations.queries';
import { OnboardingForm } from '@/features/onboarding/components/OnboardingForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function OnboardingPage() {
  // 1. Enforce Server Authorization via DAL
  const { user, profile } = await requirePendingOnboardingUser();

  const t = await getTranslations('onboarding');

  // 2. Fetch country & location data
  const countries = await getActiveCountries();
  const defaultCountry = countries[0]?.code || 'KE';
  const locations = await getLocationsByCountry(defaultCountry);

  const initialDisplayName =
    profile?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '';

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="border-border bg-white shadow-sm">
        <CardHeader className="text-start pb-4">
          <div className="mb-2 inline-flex items-center rounded-chip bg-pine-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-pine-800">
            Nairobi Beta Onboarding
          </div>
          <CardTitle className="text-2xl font-semibold text-ink">
            {t('title')}
          </CardTitle>
          <CardDescription className="text-sm text-text-secondary mt-1">
            {t('subtitle')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <OnboardingForm
            initialDisplayName={initialDisplayName}
            countries={countries}
            locations={locations}
          />
        </CardContent>
      </Card>
    </div>
  );
}

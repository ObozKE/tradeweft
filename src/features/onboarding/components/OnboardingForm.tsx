'use client';

import React, { useActionState, useState, useMemo } from 'react';
import { submitOnboardingAction } from '../actions/onboarding.actions';
import type { Country, Location } from '../queries/locations.queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ErrorAlert } from '@/components/shared/ErrorAlert';
import { Loader2, CheckCircle2 } from 'lucide-react';

export interface OnboardingFormProps {
  initialDisplayName?: string;
  countries: Country[];
  locations: Location[];
}

export function OnboardingForm({
  initialDisplayName = '',
  countries,
  locations,
}: OnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(
    submitOnboardingAction,
    null
  );

  const [accountType, setAccountType] = useState<'freelancer' | 'business'>('freelancer');
  const [selectedCountry, setSelectedCountry] = useState<string>(
    countries[0]?.code || 'KE'
  );

  // Group locations into cities and areas based on the tree
  const cities = useMemo(() => {
    return locations.filter(
      (loc) => loc.country_code === selectedCountry && loc.level === 'city'
    );
  }, [locations, selectedCountry]);

  const [selectedCityId, setSelectedCityId] = useState<string>(
    cities[0]?.id || ''
  );

  const areas = useMemo(() => {
    return locations.filter(
      (loc) =>
        loc.country_code === selectedCountry &&
        loc.level === 'area' &&
        (!selectedCityId || loc.parent_id === selectedCityId)
    );
  }, [locations, selectedCountry, selectedCityId]);

  const [selectedAreaId, setSelectedAreaId] = useState<string>(
    areas[0]?.id || ''
  );

  // When city changes, update selected area
  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCityId = e.target.value;
    setSelectedCityId(newCityId);
    const availableAreas = locations.filter(
      (loc) => loc.level === 'area' && loc.parent_id === newCityId
    );
    if (availableAreas.length > 0) {
      setSelectedAreaId(availableAreas[0].id);
    } else {
      setSelectedAreaId('');
    }
  };

  return (
    <form action={formAction} className="space-y-6 text-start">
      {state?.error && (
        <ErrorAlert
          title="Onboarding Form Notice"
          message={state.error}
          className="mb-6"
        />
      )}

      {/* Hidden terms version */}
      <input type="hidden" name="termsVersion" value="v1.0-ke-2026" />

      {/* Display Name */}
      <div className="space-y-2">
        <Label htmlFor="displayName" requiredIndicator>
          Full Name / Professional Display Name
        </Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={initialDisplayName}
          placeholder="e.g. Wangari Maathai or Studio Nomi"
          error={!!state?.fieldErrors?.displayName}
          required
        />
        {state?.fieldErrors?.displayName && (
          <p className="text-xs text-amber-800 font-medium">
            {state.fieldErrors.displayName[0]}
          </p>
        )}
      </div>

      {/* Account Type Selection */}
      <div className="space-y-2">
        <Label requiredIndicator>Account Type</Label>
        <div className="grid grid-cols-2 gap-4">
          <label
            className={`flex cursor-pointer flex-col rounded-button border p-4 transition ${
              accountType === 'freelancer'
                ? 'border-primary bg-pine-50/70 shadow-sm'
                : 'border-border bg-white hover:bg-surface-sunken'
            }`}
          >
            <input
              type="radio"
              name="accountType"
              value="freelancer"
              checked={accountType === 'freelancer'}
              onChange={() => setAccountType('freelancer')}
              className="sr-only"
            />
            <span className="text-sm font-semibold text-ink">Freelancer</span>
            <span className="text-xs text-text-secondary mt-1">
              Independent professional trading skills
            </span>
          </label>

          <label
            className={`flex cursor-pointer flex-col rounded-button border p-4 transition ${
              accountType === 'business'
                ? 'border-primary bg-pine-50/70 shadow-sm'
                : 'border-border bg-white hover:bg-surface-sunken'
            }`}
          >
            <input
              type="radio"
              name="accountType"
              value="business"
              checked={accountType === 'business'}
              onChange={() => setAccountType('business')}
              className="sr-only"
            />
            <span className="text-sm font-semibold text-ink">Business</span>
            <span className="text-xs text-text-secondary mt-1">
              Registered business trading corporate services
            </span>
          </label>
        </div>
      </div>

      {/* Business Name (Conditional / Optional) */}
      {accountType === 'business' && (
        <div className="space-y-2">
          <Label htmlFor="businessName" requiredIndicator>
            Registered Business Name
          </Label>
          <Input
            id="businessName"
            name="businessName"
            placeholder="e.g. Acme Tech Solutions Ltd"
            error={!!state?.fieldErrors?.businessName}
            required
          />
          {state?.fieldErrors?.businessName && (
            <p className="text-xs text-amber-800 font-medium">
              {state.fieldErrors.businessName[0]}
            </p>
          )}
        </div>
      )}

      {/* Location Hierarchy: Dependent Dropdowns */}
      <div className="space-y-4 rounded-button border border-border bg-surface-sunken/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
          Location & Matching
        </p>

        {/* Country */}
        <div className="space-y-2">
          <Label htmlFor="countryCode" requiredIndicator>
            Country
          </Label>
          <Select
            id="countryCode"
            name="countryCode"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.currency_code})
              </option>
            ))}
          </Select>
        </div>

        {/* City */}
        <div className="space-y-2">
          <Label htmlFor="cityId" requiredIndicator>
            City / County
          </Label>
          <Select
            id="cityId"
            name="cityId"
            value={selectedCityId}
            onChange={handleCityChange}
            error={!!state?.fieldErrors?.cityId}
          >
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Neighborhood / Area */}
        <div className="space-y-2">
          <Label htmlFor="areaId" requiredIndicator>
            Neighborhood / Sub-county
          </Label>
          <Select
            id="areaId"
            name="areaId"
            value={selectedAreaId}
            onChange={(e) => setSelectedAreaId(e.target.value)}
            error={!!state?.fieldErrors?.areaId}
          >
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
          {state?.fieldErrors?.areaId && (
            <p className="text-xs text-amber-800 font-medium">
              {state.fieldErrors.areaId[0]}
            </p>
          )}
        </div>
      </div>

      {/* Remote Delivery Toggle */}
      <div className="rounded-button border border-border bg-white p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="remoteDelivery"
            value="true"
            defaultChecked={false}
            className="mt-1 h-5 w-5 rounded border-input-border text-primary focus:ring-pine-500 accent-primary"
          />
          <div className="text-sm">
            <span className="font-medium text-ink">Remote Service Delivery</span>
            <p className="text-xs text-text-secondary mt-0.5">
              I can deliver services digitally or remotely to clients across Kenya and international markets.
            </p>
          </div>
        </label>
      </div>

      {/* Terms & Consent Checkbox */}
      <div className="space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="termsAccepted"
            value="true"
            required
            className="mt-1 h-5 w-5 rounded border-input-border text-primary focus:ring-pine-500 accent-primary"
          />
          <span className="text-xs text-text-secondary leading-relaxed">
            I accept the Trade Weft B2B Barter Marketplace Terms of Service and acknowledge the Kenya Data Protection Act compliance policy (v1.0-ke-2026).
          </span>
        </label>
        {state?.fieldErrors?.termsAccepted && (
          <p className="text-xs text-amber-800 font-medium">
            {state.fieldErrors.termsAccepted[0]}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-12 text-base"
        variant="primary"
      >
        {isPending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Saving Your Profile...</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            <span>Complete Onboarding</span>
          </>
        )}
      </Button>
    </form>
  );
}

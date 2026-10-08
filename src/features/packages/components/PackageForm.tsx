'use client';

import React, { useActionState, useState, useMemo, useEffect } from 'react';
import { saveServicePackageAction } from '../actions/package.actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ErrorAlert } from '@/components/shared/ErrorAlert';
import { DeliverablesEditor } from './DeliverablesEditor';
import { LivePackagePreview } from './LivePackagePreview';
import { FALLBACK_LOCATIONS, type Location } from '@/features/onboarding/data/locations.constants';
import { FALLBACK_CATEGORIES, type CategoryItem } from '../data/categories.constants';
import { Loader2, Save, Eye, Edit3 } from 'lucide-react';

interface PackageFormProps {
  initialPackage?: {
    id?: string;
    title?: string;
    summary?: string;
    description?: string;
    category_id?: string;
    delivery_mode?: 'in_person' | 'remote' | 'hybrid';
    country_code?: string;
    city_id?: string | null;
    area_id?: string | null;
    turnaround_days?: number;
    capacity_per_month?: number | null;
    indicative_value_minor?: number | null;
    currency_code?: string;
    deliverables?: string[];
    exclusions?: string[];
    seekingCategoryIds?: string[];
    status?: string;
    updated_at?: string;
  };
  categories?: CategoryItem[];
  providerName?: string;
}

export function PackageForm({
  initialPackage,
  categories = [],
  providerName = 'Your Business Profile',
}: PackageFormProps) {
  const [state, formAction, isPending] = useActionState(
    saveServicePackageAction,
    null
  );

  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Resilient category taxonomy fallback ensures dropdown options always render
  const effectiveCategories = useMemo(() => {
    return categories && categories.length > 0 ? categories : FALLBACK_CATEGORIES;
  }, [categories]);

  // Form State for Live Preview Sync
  const [title, setTitle] = useState(initialPackage?.title || '');
  const [summary, setSummary] = useState(initialPackage?.summary || '');
  const [description, setDescription] = useState(initialPackage?.description || '');
  const [categoryId, setCategoryId] = useState(
    initialPackage?.category_id || effectiveCategories[0]?.id || ''
  );
  const [deliveryMode, setDeliveryMode] = useState<'in_person' | 'remote' | 'hybrid'>(
    initialPackage?.delivery_mode || 'remote'
  );
  const [cityId, setCityId] = useState(initialPackage?.city_id || '99990000-0000-0000-0000-000000000002');
  const [areaId, setAreaId] = useState(initialPackage?.area_id || '');
  const [turnaroundDays, setTurnaroundDays] = useState(initialPackage?.turnaround_days || 7);
  const [indicativeValueMinor, setIndicativeValueMinor] = useState<number | null>(
    initialPackage?.indicative_value_minor ?? 2500000
  );
  const [currencyCode, setCurrencyCode] = useState(initialPackage?.currency_code || 'KES');
  const [seekingCategoryIds, setSeekingCategoryIds] = useState<string[]>(
    initialPackage?.seekingCategoryIds || []
  );

  // Synchronize categoryId if effectiveCategories load or initial value is missing
  useEffect(() => {
    if (
      effectiveCategories.length > 0 &&
      (!categoryId || !effectiveCategories.some((c) => c.id === categoryId))
    ) {
      setCategoryId(effectiveCategories[0].id);
    }
  }, [effectiveCategories, categoryId]);

  // Filter locations for Kenya
  const cities = useMemo(() => {
    return FALLBACK_LOCATIONS.filter((l) => l.country_code === 'KE' && l.level === 'city');
  }, []);

  const areas = useMemo(() => {
    return FALLBACK_LOCATIONS.filter(
      (l) => l.country_code === 'KE' && l.level === 'area' && (!cityId || l.parent_id === cityId)
    );
  }, [cityId]);

  const selectedCategoryName = useMemo(() => {
    return effectiveCategories.find((c) => c.id === categoryId)?.name || 'Service Category';
  }, [effectiveCategories, categoryId]);

  const selectedCityName = useMemo(() => {
    return cities.find((c) => c.id === cityId)?.name || 'Nairobi';
  }, [cities, cityId]);

  const selectedAreaName = useMemo(() => {
    return areas.find((a) => a.id === areaId)?.name || undefined;
  }, [areas, areaId]);

  const seekingCategoryNames = useMemo(() => {
    return seekingCategoryIds
      .map((id) => effectiveCategories.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];
  }, [effectiveCategories, seekingCategoryIds]);

  const toggleSeekingCategory = (id: string) => {
    if (seekingCategoryIds.includes(id)) {
      setSeekingCategoryIds(seekingCategoryIds.filter((item) => item !== id));
    } else {
      if (seekingCategoryIds.length < 5) {
        setSeekingCategoryIds([...seekingCategoryIds, id]);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={activeTab === 'edit' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('edit')}
            className="text-xs"
          >
            <Edit3 className="me-1.5 h-3.5 w-3.5" />
            Edit Package
          </Button>
          <Button
            type="button"
            variant={activeTab === 'preview' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('preview')}
            className="text-xs"
          >
            <Eye className="me-1.5 h-3.5 w-3.5" />
            Live Preview
          </Button>
        </div>
        <span className="text-xs text-text-muted">
          {initialPackage?.id ? 'Editing Existing Package' : 'Drafting New Package'}
        </span>
      </div>

      {state?.error && (
        <ErrorAlert
          title="Validation Notice"
          message={state.error}
          className="mb-4"
        />
      )}

      {activeTab === 'preview' ? (
        <div className="mx-auto max-w-xl py-4">
          <p className="text-xs text-text-secondary uppercase tracking-[0.04em] font-semibold mb-3">
            Public Card Preview
          </p>
          <LivePackagePreview
            title={title}
            summary={summary}
            categoryName={selectedCategoryName}
            deliveryMode={deliveryMode}
            cityName={selectedCityName}
            areaName={selectedAreaName}
            turnaroundDays={Number(turnaroundDays)}
            indicativeValueMinor={indicativeValueMinor}
            currencyCode={currencyCode}
            seekingCategoryNames={seekingCategoryNames}
            providerName={providerName}
          />
        </div>
      ) : (
        <form action={formAction} className="space-y-6 text-start">
          {initialPackage?.id && <input type="hidden" name="id" value={initialPackage.id} />}
          {initialPackage?.updated_at && (
            <input type="hidden" name="expectedUpdatedAt" value={initialPackage.updated_at} />
          )}
          <input type="hidden" name="countryCode" value="KE" />

          {/* Title */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="title" requiredIndicator>
                Service Package Title
              </Label>
              <span className="text-xs text-text-muted">{title.length}/80 chars</span>
            </div>
            <Input
              id="title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Next.js Web Development & Landing Page"
              maxLength={80}
              required
              error={!!state?.fieldErrors?.title}
            />
            {state?.fieldErrors?.title && (
              <p className="text-xs text-amber-800 font-medium">{state.fieldErrors.title[0]}</p>
            )}
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="categoryId" requiredIndicator>
              Category Taxonomy
            </Label>
            <Select
              id="categoryId"
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              error={!!state?.fieldErrors?.categoryId}
              required
            >
              {effectiveCategories.length === 0 ? (
                <option value="" disabled className="text-text-muted bg-white">
                  Loading categories...
                </option>
              ) : (
                effectiveCategories.map((cat) => (
                  <option key={cat.id} value={cat.id} className="text-ink bg-white">
                    {cat.parentId ? `\u00A0\u00A0\u00A0\u00A0↳ ${cat.name}` : cat.name}
                  </option>
                ))
              )}
            </Select>
            {state?.fieldErrors?.categoryId && (
              <p className="text-xs text-amber-800 font-medium">{state.fieldErrors.categoryId[0]}</p>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="summary" requiredIndicator>
                High-Level Summary
              </Label>
              <span className="text-xs text-text-muted">{summary.length}/160 chars</span>
            </div>
            <textarea
              id="summary"
              name="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief summary appearing on marketplace search cards (20-160 characters)"
              rows={2}
              maxLength={160}
              required
              className="w-full rounded-button border border-input-border bg-white p-3 text-sm text-ink placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-pine-500"
            />
            {state?.fieldErrors?.summary && (
              <p className="text-xs text-amber-800 font-medium">{state.fieldErrors.summary[0]}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="description" requiredIndicator>
                Detailed Service Description
              </Label>
              <span className="text-xs text-text-muted">{description.length}/2000 chars</span>
            </div>
            <textarea
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed breakdown of your workflow, tools used, requirements from client, and expected trade collaboration."
              rows={5}
              maxLength={2000}
              required
              className="w-full rounded-button border border-input-border bg-white p-3 text-sm text-ink placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-pine-500"
            />
            {state?.fieldErrors?.description && (
              <p className="text-xs text-amber-800 font-medium">{state.fieldErrors.description[0]}</p>
            )}
          </div>

          {/* Delivery Mode & Location */}
          <div className="space-y-4 rounded-button border border-border bg-surface-sunken/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
              Delivery Mode & Geographic Scope
            </p>

            <div className="grid grid-cols-3 gap-3">
              {(['remote', 'in_person', 'hybrid'] as const).map((mode) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-button border p-3 text-center transition ${
                    deliveryMode === mode
                      ? 'border-primary bg-pine-50 shadow-sm'
                      : 'border-border bg-white hover:bg-surface-sunken'
                  }`}
                >
                  <input
                    type="radio"
                    name="deliveryMode"
                    value={mode}
                    checked={deliveryMode === mode}
                    onChange={() => setDeliveryMode(mode)}
                    className="sr-only"
                  />
                  <span className="text-xs font-semibold capitalize text-ink">
                    {mode.replace('_', ' ')}
                  </span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cityId" requiredIndicator>
                  Operating City
                </Label>
                <Select
                  id="cityId"
                  name="cityId"
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  error={!!state?.fieldErrors?.cityId}
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id} className="text-ink bg-white">
                      {c.name}
                    </option>
                  ))}
                </Select>
                {state?.fieldErrors?.cityId && (
                  <p className="text-xs text-amber-800 font-medium">{state.fieldErrors.cityId[0]}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="areaId"
                  requiredIndicator={deliveryMode === 'in_person' || deliveryMode === 'hybrid'}
                >
                  Neighborhood
                </Label>
                <Select
                  id="areaId"
                  name="areaId"
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                  error={!!state?.fieldErrors?.areaId}
                >
                  <option value="" className="text-text-muted bg-white">
                    {deliveryMode === 'remote' ? 'City-wide (Optional)' : 'Select Neighborhood'}
                  </option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id} className="text-ink bg-white">
                      {a.name}
                    </option>
                  ))}
                </Select>
                {state?.fieldErrors?.areaId && (
                  <p className="text-xs text-amber-800 font-medium">{state.fieldErrors.areaId[0]}</p>
                )}
              </div>
            </div>
          </div>

          {/* Turnaround, Capacity & Indicative Value */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="turnaroundDays" requiredIndicator>
                Turnaround (Days)
              </Label>
              <Input
                id="turnaroundDays"
                name="turnaroundDays"
                type="number"
                min={1}
                max={180}
                value={turnaroundDays}
                onChange={(e) => setTurnaroundDays(Number(e.target.value))}
                required
                error={!!state?.fieldErrors?.turnaroundDays}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacityPerMonth">Monthly Capacity</Label>
              <Input
                id="capacityPerMonth"
                name="capacityPerMonth"
                type="number"
                min={1}
                max={100}
                defaultValue={initialPackage?.capacity_per_month || ''}
                placeholder="e.g. 5 clients"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="indicativeValueMinor">Indicative Value (KES)</Label>
              <Input
                id="indicativeValueMinor"
                name="indicativeValueMinor"
                type="number"
                min={0}
                value={indicativeValueMinor ?? ''}
                onChange={(e) =>
                  setIndicativeValueMinor(e.target.value ? Number(e.target.value) : null)
                }
                placeholder="e.g. 25000"
              />
            </div>
          </div>

          {/* Deliverables and Exclusions Editor */}
          <DeliverablesEditor
            initialDeliverables={initialPackage?.deliverables}
            initialExclusions={initialPackage?.exclusions}
            errors={{
              deliverables: state?.fieldErrors?.deliverables,
              exclusions: state?.fieldErrors?.exclusions,
            }}
          />

          {/* Seeking Categories (Matchmaking Wants) */}
          <div className="space-y-3 rounded-button border border-border bg-white p-4">
            <div className="flex justify-between items-center">
              <div>
                <Label className="text-sm font-semibold text-ink">
                  What You Are Seeking in Barter (Up to 5 Categories)
                </Label>
                <p className="text-xs text-text-secondary mt-0.5">
                  Select categories you would gladly accept in return to boost matchmaking.
                </p>
              </div>
              <span className="text-xs text-text-muted">{seekingCategoryIds.length}/5 selected</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {effectiveCategories
                .filter((cat) => cat.parentId === null)
                .map((cat) => {
                  const isSelected = seekingCategoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleSeekingCategory(cat.id)}
                      className={`rounded-chip border px-3 py-1 text-xs font-medium transition cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-pine-100 text-pine-800'
                          : 'border-border bg-surface-sunken/60 text-ink hover:bg-surface-sunken'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      {cat.name}
                    </button>
                  );
                })}
            </div>

            {seekingCategoryIds.map((id) => (
              <input key={id} type="hidden" name="seekingCategories" value={id} />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="submit"
              disabled={isPending}
              variant="primary"
              className="h-11 px-6 text-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  Saving Package...
                </>
              ) : (
                <>
                  <Save className="me-2 h-4 w-4" />
                  Save Draft
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

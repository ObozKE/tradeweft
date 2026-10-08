'use client';

import React, { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { FALLBACK_LOCATIONS } from '@/features/onboarding/data/locations.constants';
import { FALLBACK_CATEGORIES } from '../data/categories.constants';
import type { CategoryItem } from '../queries/package.queries';
import { Filter, X, Search, RotateCcw } from 'lucide-react';

interface ExploreFiltersProps {
  categories?: CategoryItem[];
}

export function ExploreFilters({ categories = [] }: ExploreFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const effectiveCategories = useMemo(() => {
    return categories && categories.length > 0 ? categories : FALLBACK_CATEGORIES;
  }, [categories]);

  const [isOpenMobile, setIsOpenMobile] = useState(false);

  const currentQ = searchParams.get('q') || '';
  const currentCity = searchParams.get('city') || '';
  const currentArea = searchParams.get('area') || '';
  const currentCategory = searchParams.get('category') || '';
  const currentSeeking = searchParams.get('seeking') || '';
  const currentMode = searchParams.get('mode') || '';

  const [q, setQ] = useState(currentQ);
  const [city, setCity] = useState(currentCity);
  const [area, setArea] = useState(currentArea);
  const [category, setCategory] = useState(currentCategory);
  const [seeking, setSeeking] = useState(currentSeeking);
  const [mode, setMode] = useState(currentMode);

  const cities = FALLBACK_LOCATIONS.filter((l) => l.country_code === 'KE' && l.level === 'city');
  const areas = FALLBACK_LOCATIONS.filter(
    (l) => l.country_code === 'KE' && l.level === 'area' && (!city || l.parent_id === city)
  );

  const applyFilters = (overrides?: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set('country', 'KE');

    const values = {
      q,
      city,
      area,
      category,
      seeking,
      mode,
      ...overrides,
    };

    if (values.q) params.set('q', values.q);
    if (values.city) params.set('city', values.city);
    if (values.area) params.set('area', values.area);
    if (values.category) params.set('category', values.category);
    if (values.seeking) params.set('seeking', values.seeking);
    if (values.mode) params.set('mode', values.mode);

    router.push(`/explore?${params.toString()}`);
    setIsOpenMobile(false);
  };

  const resetFilters = () => {
    setQ('');
    setCity('');
    setArea('');
    setCategory('');
    setSeeking('');
    setMode('');
    router.push('/explore?country=KE');
    setIsOpenMobile(false);
  };

  const activeFilterCount = [
    Boolean(currentCity),
    Boolean(currentArea),
    Boolean(currentCategory),
    Boolean(currentSeeking),
    Boolean(currentMode),
    Boolean(currentQ),
  ].filter(Boolean).length;

  const content = (
    <div className="space-y-5">
      {/* Search Query Input */}
      <div className="space-y-1.5">
        <Label htmlFor="searchQuery" className="text-xs font-semibold text-ink">
          Keyword Search
        </Label>
        <div className="relative">
          <Input
            id="searchQuery"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="e.g. Website, Tax, Photography"
            className="h-10 pe-9 text-xs"
          />
          <button
            type="button"
            onClick={() => applyFilters()}
            className="absolute inset-y-0 end-0 flex items-center pe-3 text-text-muted hover:text-primary"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="space-y-1.5">
        <Label htmlFor="filterCategory" className="text-xs font-semibold text-ink">
          Offering Category
        </Label>
        <Select
          id="filterCategory"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 text-xs"
        >
          <option value="">All Categories</option>
          {effectiveCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? `\u00A0\u00A0\u00A0\u00A0↳ ${c.name}` : c.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Seeking Category (Barter Wants) */}
      <div className="space-y-1.5">
        <Label htmlFor="filterSeeking" className="text-xs font-semibold text-ink">
          Provider is Seeking in Return
        </Label>
        <Select
          id="filterSeeking"
          value={seeking}
          onChange={(e) => setSeeking(e.target.value)}
          className="h-10 text-xs"
        >
          <option value="">Any Wants (Open Trade)</option>
          {effectiveCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? `\u00A0\u00A0\u00A0\u00A0↳ ${c.name}` : c.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Delivery Mode Tabs */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-ink">Delivery Mode</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'All Modes', value: '' },
            { label: 'Remote', value: 'remote' },
            { label: 'In-person', value: 'in_person' },
            { label: 'Hybrid', value: 'hybrid' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={`rounded-button border py-1.5 text-xs font-medium transition cursor-pointer ${
                mode === item.value
                  ? 'border-primary bg-pine-100 text-pine-900 font-semibold'
                  : 'border-border bg-white text-ink hover:bg-surface-sunken'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* City Location */}
      <div className="space-y-1.5">
        <Label htmlFor="filterCity" className="text-xs font-semibold text-ink">
          City / County
        </Label>
        <Select
          id="filterCity"
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setArea('');
          }}
          className="h-10 text-xs"
        >
          <option value="">All Cities in Kenya</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Neighborhood (Dependent on City) */}
      <div className="space-y-1.5">
        <Label htmlFor="filterArea" className="text-xs font-semibold text-ink">
          Neighborhood / Area
        </Label>
        <Select
          id="filterArea"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="h-10 text-xs"
        >
          <option value="">All Neighborhoods</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => applyFilters()}
          className="flex-1 h-9 text-xs"
        >
          Apply Filters
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetFilters}
          className="h-9 px-3 text-xs"
          title="Reset all filters"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar Container */}
      <aside className="hidden lg:block w-72 shrink-0 rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-pine-600" />
            <span className="text-sm font-semibold text-ink">Marketplace Filters</span>
          </div>
          {activeFilterCount > 0 && (
            <span className="rounded-chip bg-pine-100 px-2 py-0.5 text-xs font-semibold text-pine-800">
              {activeFilterCount}
            </span>
          )}
        </div>
        {content}
      </aside>

      {/* Mobile Drawer Trigger Button */}
      <div className="lg:hidden w-full mb-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpenMobile(true)}
          className="w-full flex items-center justify-between h-11 border-border bg-white text-ink text-sm shadow-sm"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-pine-600" />
            <span>Filter & Search Packages</span>
          </span>
          {activeFilterCount > 0 && (
            <span className="rounded-chip bg-pine-100 px-2 py-0.5 text-xs font-semibold text-pine-800">
              {activeFilterCount} active
            </span>
          )}
        </Button>

        {/* Mobile Slide-Over Modal */}
        {isOpenMobile && (
          <div className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-xs">
            <div className="ms-auto flex h-full w-full max-w-xs flex-col bg-white p-6 shadow-xl overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                <span className="text-base font-semibold text-ink">Filters</span>
                <button
                  type="button"
                  onClick={() => setIsOpenMobile(false)}
                  className="rounded-full p-1 text-text-muted hover:text-ink"
                  aria-label="Close filters"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {content}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

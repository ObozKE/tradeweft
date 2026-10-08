import React from 'react';
import { Clock, MapPin, Globe, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatIndicativeValue } from '../utils/currency';

interface LivePackagePreviewProps {
  title?: string;
  summary?: string;
  categoryName?: string;
  deliveryMode?: 'in_person' | 'remote' | 'hybrid';
  cityName?: string;
  areaName?: string;
  turnaroundDays?: number;
  indicativeValueMinor?: number | null;
  currencyCode?: string;
  deliverables?: string[];
  seekingCategoryNames?: string[];
  providerName?: string;
}

export function LivePackagePreview({
  title = 'Your Service Package Title',
  summary = 'A clear, high-level summary of what you are trading will appear here.',
  categoryName = 'Web & Software',
  deliveryMode = 'remote',
  cityName = 'Nairobi',
  areaName,
  turnaroundDays = 7,
  indicativeValueMinor = 2500000,
  currencyCode = 'KES',
  deliverables = ['High quality deliverable 1', 'Documented results'],
  seekingCategoryNames = [],
  providerName = 'Your Business / Name',
}: LivePackagePreviewProps) {
  const formattedValue = formatIndicativeValue(indicativeValueMinor, currencyCode);

  return (
    <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="rounded-chip bg-pine-200 px-3 py-1 font-semibold uppercase tracking-[0.04em] text-pine-800">
          {categoryName}
        </span>
        <span className="inline-flex items-center gap-1 text-text-secondary font-medium">
          {deliveryMode === 'remote' ? (
            <>
              <Globe className="h-3.5 w-3.5 text-pine-600" />
              <span>Remote Delivery</span>
            </>
          ) : (
            <>
              <MapPin className="h-3.5 w-3.5 text-pine-600" />
              <span>{areaName ? `${areaName}, ${cityName}` : cityName}</span>
            </>
          )}
        </span>
      </div>

      <h3 className="text-xl font-semibold text-ink leading-snug">
        {title || 'Service Title Placeholder'}
      </h3>

      <p className="mt-2 text-sm text-text-secondary line-clamp-3 leading-relaxed">
        {summary || 'Summary placeholder...'}
      </p>

      {/* Meta Bar */}
      <div className="mt-4 flex flex-wrap items-center gap-4 border-y border-border py-3 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-pine-600" />
          <span>{turnaroundDays} Days Turnaround</span>
        </div>
        <div className="font-semibold text-ink">
          <span>Est. Value: </span>
          <span className="text-pine-700">{formattedValue}</span>
        </div>
      </div>

      {/* Deliverables snippet */}
      {deliverables.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-text-muted">
            Included Deliverables:
          </p>
          <ul className="space-y-1">
            {deliverables.slice(0, 3).map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-ink">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pine-600" />
                <span className="line-clamp-1">{item}</span>
              </li>
            ))}
            {deliverables.length > 3 && (
              <li className="text-xs text-text-muted italic ps-5">
                + {deliverables.length - 3} more deliverables
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Seeking Barter Wants */}
      {seekingCategoryNames.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-[0.04em] mb-1.5">
            Seeking In Return:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {seekingCategoryNames.map((name, idx) => (
              <span
                key={idx}
                className="rounded-chip bg-surface-sunken border border-border px-2.5 py-0.5 text-xs text-ink"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Provider Footer */}
      <div className="mt-5 flex items-center justify-between pt-3 border-t border-border text-xs text-text-muted">
        <span>Provider: <strong className="text-ink">{providerName}</strong></span>
        <span className="inline-flex items-center gap-1 text-pine-600 font-medium">
          View Detail <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

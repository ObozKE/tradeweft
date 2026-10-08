'use client';

import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DeliverablesEditorProps {
  initialDeliverables?: string[];
  initialExclusions?: string[];
  errors?: {
    deliverables?: string[];
    exclusions?: string[];
  };
}

export function DeliverablesEditor({
  initialDeliverables = [''],
  initialExclusions = [],
  errors,
}: DeliverablesEditorProps) {
  const [deliverables, setDeliverables] = useState<string[]>(
    initialDeliverables.length > 0 ? initialDeliverables : ['']
  );
  const [exclusions, setExclusions] = useState<string[]>(initialExclusions);

  const addDeliverable = () => {
    if (deliverables.length < 10) {
      setDeliverables([...deliverables, '']);
    }
  };

  const removeDeliverable = (index: number) => {
    if (deliverables.length > 1) {
      setDeliverables(deliverables.filter((_, i) => i !== index));
    }
  };

  const updateDeliverable = (index: number, value: string) => {
    const updated = [...deliverables];
    updated[index] = value;
    setDeliverables(updated);
  };

  const addExclusion = () => {
    if (exclusions.length < 10) {
      setExclusions([...exclusions, '']);
    }
  };

  const removeExclusion = (index: number) => {
    setExclusions(exclusions.filter((_, i) => i !== index));
  };

  const updateExclusion = (index: number, value: string) => {
    const updated = [...exclusions];
    updated[index] = value;
    setExclusions(updated);
  };

  return (
    <div className="space-y-6">
      {/* Deliverables Section */}
      <div className="space-y-3 rounded-button border border-border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label requiredIndicator className="text-sm font-semibold text-ink">
              Included Deliverables ({deliverables.length}/10)
            </Label>
            <p className="text-xs text-text-secondary mt-0.5">
              Specify clear, verifiable outputs agreed upon in trade.
            </p>
          </div>
          {deliverables.length < 10 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addDeliverable}
              className="text-xs"
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              Add Item
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {deliverables.map((item, index) => (
            <div key={`deliv-${index}`} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pine-100 text-xs font-semibold text-pine-800">
                {index + 1}
              </span>
              <Input
                name="deliverables"
                value={item}
                onChange={(e) => updateDeliverable(index, e.target.value)}
                placeholder="e.g. Responsive 5-page website delivered on Vercel"
                maxLength={120}
                required={index === 0}
                className="flex-1"
              />
              {deliverables.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDeliverable(index)}
                  className="text-text-muted hover:text-amber-800 p-2"
                  aria-label={`Remove deliverable ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {errors?.deliverables && (
          <p className="text-xs text-amber-800 font-medium">{errors.deliverables[0]}</p>
        )}
      </div>

      {/* Exclusions Section */}
      <div className="space-y-3 rounded-button border border-border bg-surface-sunken/40 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold text-ink">
              Out of Scope / Exclusions ({exclusions.length}/10)
            </Label>
            <p className="text-xs text-text-secondary mt-0.5">
              Explicitly state items not included (e.g., third-party domain or hosting costs).
            </p>
          </div>
          {exclusions.length < 10 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addExclusion}
              className="text-xs bg-white"
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              Add Exclusion
            </Button>
          )}
        </div>

        {exclusions.length === 0 ? (
          <p className="text-xs text-text-muted italic">No exclusions specified yet.</p>
        ) : (
          <div className="space-y-2">
            {exclusions.map((item, index) => (
              <div key={`excl-${index}`} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-text-secondary">
                  ✕
                </span>
                <Input
                  name="exclusions"
                  value={item}
                  onChange={(e) => updateExclusion(index, e.target.value)}
                  placeholder="e.g. Custom typography font licenses"
                  maxLength={120}
                  className="flex-1 bg-white"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeExclusion(index)}
                  className="text-text-muted hover:text-amber-800 p-2"
                  aria-label={`Remove exclusion ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {errors?.exclusions && (
          <p className="text-xs text-amber-800 font-medium">{errors.exclusions[0]}</p>
        )}
      </div>
    </div>
  );
}

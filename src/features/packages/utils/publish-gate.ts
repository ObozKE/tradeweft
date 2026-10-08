export interface PublishGateEvaluation {
  canPublish: boolean;
  reasons: string[];
}

export interface PublishGateInput {
  hasCompletedOnboarding: boolean;
  title?: string;
  summary?: string;
  description?: string;
  deliveryMode?: 'in_person' | 'remote' | 'hybrid';
  cityId?: string | null;
  areaId?: string | null;
  deliverables?: unknown[];
  status?: string;
  activePackageCount?: number;
  maxActivePackages?: number;
}

/**
 * Publish gate policy evaluating whether a service package is ready to be published.
 * Returns machine-readable codes for translated user feedback.
 * 
 * Phase 4 Extension Point: Identity / Business verification badges will check here.
 */
export function canPublish(input: PublishGateInput): PublishGateEvaluation {
  const reasons: string[] = [];

  // 1. Onboarding check
  if (!input.hasCompletedOnboarding) {
    reasons.push('ONBOARDING_INCOMPLETE');
  }

  // 2. Active limit check (default 10 active packages per provider)
  const maxActive = input.maxActivePackages ?? 10;
  if ((input.activePackageCount ?? 0) >= maxActive) {
    reasons.push('ACTIVE_LIMIT_EXCEEDED');
  }

  // 3. Status validity
  if (input.status === 'archived' || input.status === 'removed') {
    reasons.push('INVALID_STATUS');
  }

  // 4. Content completeness
  if (!input.title || input.title.trim().length < 10 || input.title.trim().length > 80) {
    reasons.push('INVALID_TITLE');
  }

  if (!input.summary || input.summary.trim().length < 20 || input.summary.trim().length > 160) {
    reasons.push('INVALID_SUMMARY');
  }

  if (!input.description || input.description.trim().length < 50 || input.description.trim().length > 2000) {
    reasons.push('INVALID_DESCRIPTION');
  }

  // 5. Deliverables check
  if (!input.deliverables || !Array.isArray(input.deliverables) || input.deliverables.length === 0) {
    reasons.push('DELIVERABLES_REQUIRED');
  }

  // 6. Delivery mode location requirements
  if (input.deliveryMode === 'in_person' || input.deliveryMode === 'hybrid') {
    if (!input.cityId || !input.areaId) {
      reasons.push('NEIGHBORHOOD_LOCATION_REQUIRED');
    }
  } else if (input.deliveryMode === 'remote') {
    if (!input.cityId) {
      reasons.push('CITY_LOCATION_REQUIRED');
    }
  }

  return {
    canPublish: reasons.length === 0,
    reasons,
  };
}

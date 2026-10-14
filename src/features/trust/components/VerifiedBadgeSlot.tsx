import React from 'react';
import { VerifiedBadge, type VerifiedBadgeProps } from '@/features/verification/components/VerifiedBadge';

/**
 * Backward-compatible extension slot for the Verified Badge.
 */
export function VerifiedBadgeSlot(props: VerifiedBadgeProps): React.ReactNode {
  return <VerifiedBadge {...props} />;
}

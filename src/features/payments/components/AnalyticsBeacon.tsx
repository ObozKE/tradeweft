'use client';

import { useEffect, useRef } from 'react';

interface AnalyticsBeaconProps {
  packageId?: string;
  promotionId?: string;
  eventType: 'package_view' | 'proposal_start' | 'promo_click' | 'package_impression';
}

function getSessionKey(): string {
  if (typeof window === 'undefined') return 'anon';
  let key = sessionStorage.getItem('tw_analytics_session');
  if (!key) {
    key = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('tw_analytics_session', key);
  }
  return key;
}

export function AnalyticsBeacon({
  packageId,
  promotionId,
  eventType,
}: AnalyticsBeaconProps) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    try {
      const payload = JSON.stringify({
        eventType,
        packageId,
        promotionId,
        sessionKey: getSessionKey(),
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/collect', payload);
      } else {
        fetch('/api/analytics/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Analytics beacons should fail silently without interrupting user experience
    }
  }, [packageId, promotionId, eventType]);

  return null;
}

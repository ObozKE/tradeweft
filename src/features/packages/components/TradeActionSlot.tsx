import React from 'react';

export interface TradeActionSlotProps {
  packageId: string;
  providerId: string;
}

/**
 * Phase 3 Extension Slot:
 * In Phase 2, this slot intentionally renders nothing (null).
 * Phase 3 will plug the "Propose a Barter Trade" interactive action dialog
 * into this component without modifying the detail page layout.
 */
export function TradeActionSlot(_props: TradeActionSlotProps) {
  return null;
}

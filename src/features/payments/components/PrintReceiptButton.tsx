'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export function PrintReceiptButton() {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      size="sm"
      className="bg-pine-600 hover:bg-pine-700 text-white text-xs gap-1.5 shadow-xs print:hidden"
    >
      <Printer className="h-3.5 w-3.5" />
      Print Receipt
    </Button>
  );
}

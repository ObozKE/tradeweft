'use client';

import { AlertCircle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#F7F7F7] p-6 font-sans text-[#151515]">
        <div className="max-w-md rounded-2xl border border-[#B45309]/20 bg-[#FFFBEB] p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FEF3C7] text-[#B45309]">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-[#151515]">System Notice</h1>
          <p className="mt-2 text-sm text-[#595959]">
            A critical application error occurred. No sensitive details have been exposed.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#01796F] px-5 text-sm font-medium text-white transition hover:bg-[#14574A]"
            >
              Reload Application
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="mx-auto max-w-md rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pine-100 text-pine-700">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold text-ink">Page Not Found</h1>
        <p className="mt-2 text-sm text-text-secondary">
          The trade or page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-button bg-primary px-6 text-sm font-medium text-white transition hover:bg-pine-700"
          >
            Return to Safety
          </Link>
        </div>
      </div>
    </div>
  );
}

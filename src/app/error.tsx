'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('Application error:', error);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-4xl font-bold text-red-600 dark:text-red-500">
          Something went wrong
        </h1>
        <p className="text-muted-foreground">
          We encountered an unexpected error. This has been logged and our team will investigate.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <details className="text-left p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
            <summary className="cursor-pointer font-semibold mb-2">Error Details (Development Only)</summary>
            <pre className="text-xs overflow-auto whitespace-pre-wrap break-words">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button onClick={reset} className="flex-1">
            Try Again
          </Button>
          <Button variant="outline" asChild className="flex-1">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

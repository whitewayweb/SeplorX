import { Skeleton } from "@/components/ui/skeleton";

export default function AppsLoading() {
  return (
    <div className="p-6">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-5 w-72" />
      </div>
      <Skeleton className="h-10 w-48 mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

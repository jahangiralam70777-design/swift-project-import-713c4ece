import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const BroadcastManager = lazy(() =>
  import("@/components/admin/BroadcastManager").then((m) => ({ default: m.BroadcastManager })),
);

export const Route = createFileRoute("/admin/broadcasts")({
  component: BroadcastsPage,
});

function BroadcastsPage() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <BroadcastManager />
    </Suspense>;
}

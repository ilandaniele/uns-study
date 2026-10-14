import type { Metadata } from "next";
import { Suspense } from "react";
import { SubscriptionPageClient } from "@/features/subscriptions/SubscriptionPageClient";

export const metadata: Metadata = { title: "Sala de Estudio Pro" };

export default function SuscripcionPage() {
  return (
    <Suspense fallback={null}>
      <SubscriptionPageClient />
    </Suspense>
  );
}

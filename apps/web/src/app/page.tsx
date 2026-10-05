import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { RoomPageClient } from "./sala/[slug]/RoomPageClient";

export const metadata: Metadata = {
  title: "Sala",
  description: "Mapa en tiempo real de la sala de estudio: mirá qué lugares están libres u ocupados.",
};

// Single-room MVP: the home is the principal room. `/sala/principal` redirects here (next.config.ts).
export default function HomePage() {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <RoomPageClient slug="principal" />
    </Suspense>
  );
}

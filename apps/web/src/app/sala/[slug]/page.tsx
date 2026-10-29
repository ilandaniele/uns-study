import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { RoomExperience } from "@/features/simple-room/RoomExperience";

export const metadata: Metadata = {
  title: "Sala",
  description: "Mapa en tiempo real de la sala de estudio: mirá qué lugares están libres u ocupados.",
};

// The shell is prerendered for the one real room; live data is fetched on the client.
export function generateStaticParams() {
  return [{ slug: "principal" }];
}

// Explicit props type (instead of the generated global `PageProps`) so `tsc` passes in CI before
// `next build`/`next typegen` has generated `.next/types`.
export default async function RoomPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <RoomExperience slug={slug} about={null} />
    </Suspense>
  );
}

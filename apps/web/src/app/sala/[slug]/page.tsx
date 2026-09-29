import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { RoomPageClient } from "./RoomPageClient";

export const metadata: Metadata = {
  title: "Sala",
  description: "Mapa en tiempo real de la sala de estudio: mirá qué lugares están libres u ocupados.",
};

// The shell is prerendered for the one real room; live data is fetched on the client.
export function generateStaticParams() {
  return [{ slug: "principal" }];
}

export default async function RoomPage(props: PageProps<"/sala/[slug]">) {
  const { slug } = await props.params;
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <RoomPageClient slug={slug} />
    </Suspense>
  );
}

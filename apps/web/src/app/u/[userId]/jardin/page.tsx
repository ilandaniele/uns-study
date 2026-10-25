import { SharedGardenView } from "@/features/garden/SharedGardenView";
export const metadata = { title: "Visitar jardín", robots: { index: false, follow: false } };
export default async function SharedGardenPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <SharedGardenView key={userId} userId={userId} />;
}

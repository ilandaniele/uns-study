import type { Metadata } from "next";
import { MoreView } from "@/features/navigation/MoreView";

export const metadata: Metadata = { title: "Más" };
export default function MorePage() {
  return <MoreView />;
}

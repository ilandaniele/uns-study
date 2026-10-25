import type { Metadata } from "next";
import { GardenView } from "@/features/garden/GardenView";

export const metadata: Metadata = {
  title: "Mi jardín",
  description:
    "Cultivá un jardín virtual de árboles nativos argentinos con tus horas en la sala.",
};
export default function GardenPage() {
  return <GardenView />;
}

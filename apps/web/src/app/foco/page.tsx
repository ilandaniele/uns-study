import type { Metadata } from "next";
import { FocusGate } from "@/features/focus/FocusGate";

export const metadata: Metadata = {
  title: "Foco",
  description: "Temporizador Pomodoro con tareas, ruido de fondo y avisos para estudiar en bloques.",
  alternates: { canonical: "/foco" },
};

export default function FocoPage() {
  return <FocusGate />;
}

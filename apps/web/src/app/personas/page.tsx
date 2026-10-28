import { Suspense } from "react";
import { PeopleHub } from "@/features/friends/PeopleHub";

export default function PersonasPage() {
  return <Suspense fallback={<main className="p-6 text-center text-muted">Cargando…</main>}><PeopleHub/></Suspense>;
}

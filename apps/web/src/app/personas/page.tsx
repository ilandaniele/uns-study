"use client";

import Link from "next/link";
import { PeopleList } from "@/features/people/PeopleList";
import { usePeople } from "@/features/people/usePeople";
import { useSession } from "@/lib/auth-client";

const ROOM_SLUG = "principal";

/** "Personas en la sala" — registered users in the room, full list. */
export default function PersonasPage() {
  const { data: session, isPending } = useSession();
  const { people, loading, error } = usePeople(ROOM_SLUG);

  if (isPending) {
    return <main className="p-6 text-center text-muted">Cargando…</main>;
  }

  if (!session?.user) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <p className="text-muted">Iniciá sesión para ver quién está en la sala.</p>
        <Link href="/login" className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-white">
          Ingresar
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-2 t-heading">Personas en la sala</h1>
      <p className="mb-4 text-sm text-muted">Sólo se muestran las personas registradas que decidieron aparecer acá.</p>

      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="border-y border-app">
          <PeopleList people={people} />
        </div>
      )}
    </main>
  );
}

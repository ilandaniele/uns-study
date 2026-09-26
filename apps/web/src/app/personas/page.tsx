"use client";

import { PeopleList } from "@/features/people/PeopleList";
import { usePeople } from "@/features/people/usePeople";
import { useSession } from "@/lib/auth-client";

const ROOM_SLUG = "principal";

/** "Personas en la sala" — registered users who opted into `showInRoom`, full list. */
export default function PersonasPage() {
  const { data: session, isPending } = useSession();
  const { people, loading, error } = usePeople(ROOM_SLUG);

  if (isPending) {
    return <main className="p-6 text-center text-slate-500">Cargando…</main>;
  }

  if (!session?.user) {
    return <main className="p-6 text-center text-slate-600">Iniciá sesión para ver quién está en la sala.</main>;
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-1 text-xl font-bold text-slate-900">Personas en la sala</h1>
      <p className="mb-4 text-sm text-slate-500">Sólo se muestran las personas registradas que decidieron aparecer acá.</p>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <PeopleList people={people} />
        </div>
      )}
    </main>
  );
}

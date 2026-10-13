/**
 * Map-shaped placeholder for the room page. Mirrors the real layout's grid and map container
 * classes (heights included) so swapping in the loaded room causes no layout shift.
 */
export function RoomSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando sala"
      className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)_340px] lg:items-start"
    >
      <section className="order-1 flex flex-col gap-4 lg:order-1">
        <div className="h-16 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
        <div className="h-28 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
        <div className="h-16 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
      </section>
      <section className="order-2 flex min-w-0 flex-col gap-3 lg:order-2">
        <div className="relative h-[70dvh] w-full overflow-hidden rounded-3xl border border-app bg-surface shadow-sm md:h-[80dvh] lg:mx-auto lg:aspect-[1090/1536] lg:h-[82dvh] lg:w-auto lg:max-w-full">
          <div className="h-full w-full animate-pulse bg-[var(--surface-2)]" />
        </div>
      </section>
      <section className="order-4 hidden h-48 animate-pulse rounded-2xl border border-app bg-surface lg:order-3 lg:block" />
    </main>
  );
}

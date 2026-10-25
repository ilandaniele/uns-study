/** Keeps the map's final viewport footprint while the initial snapshot loads. */
export function RoomSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando sala"
      className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:grid lg:grid-cols-[auto_minmax(360px,1fr)] lg:items-start lg:gap-x-10"
    >
      <section className="order-1 h-11 animate-pulse rounded-control bg-surface-2 lg:hidden" />
      <section className="order-2 flex min-w-0 flex-col gap-2 lg:col-start-1">
        <div className="mx-auto h-4 w-64 max-w-full animate-pulse rounded-control bg-surface-2" />
        <div className="relative h-[min(calc(100svh-272px-var(--room-banner-space,0px)),calc((100vw-2rem)*1.4092))] min-h-[180px] w-full overflow-hidden rounded-control border border-app bg-surface lg:mx-auto lg:aspect-[1090/1536] lg:h-[calc(100dvh-140px)] lg:w-auto lg:max-w-full">
          <div className="h-full w-full animate-pulse bg-surface-2" />
        </div>
      </section>
      <section className="order-3 h-16 animate-pulse rounded-2xl bg-surface-2 lg:col-start-2 lg:h-56" />
    </main>
  );
}

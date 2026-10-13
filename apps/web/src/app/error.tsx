"use client";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
      <h1 className="t-heading">Algo salió mal</h1>
      <p className="text-sm text-muted">No pudimos mostrar esta pantalla. Probá de nuevo en unos segundos.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-control bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Reintentar
      </button>
    </main>
  );
}

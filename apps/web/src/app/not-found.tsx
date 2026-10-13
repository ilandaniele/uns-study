import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
      <h1 className="t-heading">No encontramos esa página</h1>
      <p className="text-sm text-muted">Puede que el enlace esté roto o que la página ya no exista.</p>
      <Link href="/" className="rounded-control bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
        Ir a la sala
      </Link>
    </main>
  );
}

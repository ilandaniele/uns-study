"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Algo salió mal</h1>
        <p style={{ color: "#64748b" }}>No pudimos cargar la aplicación. Probá de nuevo en unos segundos.</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ marginTop: "1rem", padding: "0.5rem 1.25rem", borderRadius: "9999px", border: 0, background: "#2563EB", color: "#fff", fontWeight: 600 }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}

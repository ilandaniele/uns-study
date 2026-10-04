"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center", background: "#eceee9" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#131816" }}>Algo salió mal</h1>
        <p style={{ color: "#535b57" }}>No pudimos cargar la aplicación. Probá de nuevo en unos segundos.</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ marginTop: "1rem", padding: "0.5rem 1.25rem", borderRadius: "8px", border: 0, background: "#0f6e7e", color: "#fff", fontWeight: 600 }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}

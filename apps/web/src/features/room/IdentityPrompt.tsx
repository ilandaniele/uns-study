"use client";

export function IdentityPrompt({ onChoose }: { onChoose: (showIdentity: boolean) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-800">
        ¿Querés que otras personas registradas vean que estás en este lugar?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          onClick={() => onChoose(true)}
        >
          Sí, mostrarme
        </button>
        <button
          type="button"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => onChoose(false)}
        >
          No, mantener privado
        </button>
      </div>
    </div>
  );
}

const ITEMS: { color: string; label: string }[] = [
  { color: "#16a34a", label: "Libre" },
  { color: "#dc2626", label: "Ocupado" },
  { color: "#d97706", label: "Dudoso" },
  { color: "#9ca3af", label: "Sin datos" },
  { color: "#2563eb", label: "Tu lugar" },
];

export function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

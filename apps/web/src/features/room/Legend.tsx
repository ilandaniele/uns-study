const ITEMS: { color: string; label: string }[] = [
  { color: "var(--seat-free)", label: "Libre" },
  { color: "var(--seat-occupied)", label: "Ocupado" },
  { color: "var(--seat-uncertain)", label: "Dudoso" },
  { color: "var(--seat-unknown)", label: "Sin datos" },
  { color: "var(--seat-mine)", label: "Tu lugar" },
];

export function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Static, illustrative diagrams: no live seat data, geolocation or account requests. */
export function RoomGuideWalkthrough() {
  return (
    <aside aria-labelledby="room-walkthrough" className="space-y-5 rounded-2xl border border-app bg-surface p-4 sm:p-5">
      <div className="space-y-2">
        <h3 id="room-walkthrough" className="text-base font-semibold">Un ejemplo, paso a paso</h3>
        <p className="text-sm text-muted">Este esquema explica cómo colaborar. No muestra la ocupación actual ni asigna un asiento.</p>
      </div>

      <figure className="space-y-2">
        <svg viewBox="0 0 420 156" width="420" height="156" role="img" aria-labelledby="room-example-title" className="h-auto w-full rounded-xl bg-app">
          <title id="room-example-title">Mesa de ejemplo con ocho asientos. Uno está destacado para indicar dónde abrir su detalle.</title>
          <rect x="60" y="58" width="300" height="44" rx="10" className="fill-surface stroke-current text-muted" />
          <text x="210" y="85" textAnchor="middle" fontSize="14" className="fill-current text-main">Mesa de ejemplo</text>
          {[96, 172, 248, 324].map((x, index) => (
            <g key={x}>
              <rect x={x - 16} y="14" width="32" height="30" rx="8" className="fill-surface stroke-current text-muted" />
              <text x={x} y="34" textAnchor="middle" fontSize="13" className="fill-current text-main">{index + 1}</text>
              <rect x={x - 16} y="114" width="32" height="30" rx="8" className="fill-surface stroke-current text-muted" />
            </g>
          ))}
          <rect x="73" y="7" width="46" height="44" rx="13" fill="none" strokeWidth="3" className="stroke-current text-primary" />
          <path d="M112 47l13 18 5-7 8-1z" className="fill-current text-primary" />
        </svg>
        <figcaption className="text-sm text-muted">1. Tocá el asiento en el mapa. En su detalle, compará la mesa y la posición con la silla que tenés delante.</figcaption>
      </figure>

      <div className="space-y-3">
        <p className="text-sm font-semibold">2. Elegí la acción según lo que ves</p>
        <dl className="text-sm">
          <div className="border-b border-app py-3">
            <dt className="font-semibold">Silla vacía, sin pertenencias → Está libre</dt>
            <dd className="mt-1 text-muted">Informás disponibilidad observada. No hace falta que te sientes para colaborar.</dd>
          </div>
          <div className="border-b border-app py-3">
            <dt className="font-semibold">Otra persona sentada → Está ocupado</dt>
            <dd className="mt-1 text-muted">Es una observación sobre ese lugar. No inicia una sesión de estudio para vos.</dd>
          </div>
          <div className="border-b border-app py-3">
            <dt className="font-semibold">Mochila o apuntes, sin una persona → Está guardado</dt>
            <dd className="mt-1 text-muted">Describís las pertenencias que ves. La app no reserva la silla ni autoriza a moverlas.</dd>
          </div>
          <div className="py-3">
            <dt className="font-semibold">Te sentaste vos → Estoy acá</dt>
            <dd className="mt-1 text-muted">Confirmá tu propio asiento. Cuando te vayas, usá «Me voy»; si cambiás de silla, corregí tu registro.</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3 border-t border-app pt-4">
        <p className="text-sm font-semibold">3. Revisá cuándo se informó</p>
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-xl border border-app p-3"><p className="font-mono font-semibold text-primary">14:30</p><p className="mt-1">Se informa «Está libre».</p></li>
          <li className="rounded-xl border border-app p-3"><p className="font-mono font-semibold text-primary">15:30</p><p className="mt-1">El reporte sigue vigente, pero tiene una hora de antigüedad.</p></li>
          <li className="rounded-xl border border-app p-3"><p className="font-mono font-semibold text-primary">16:30</p><p className="mt-1">Si no hay información nueva ni otra evidencia vigente, vuelve a «Sin datos».</p></li>
        </ol>
        <p className="text-xs text-muted">Horarios ilustrativos. Si alguien se sienta o informa un cambio antes, el estado puede actualizarse antes de las dos horas. Siempre comprobá el lugar al llegar.</p>
      </div>
    </aside>
  );
}

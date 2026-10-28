# Marcado administrativo y deshacer

“Todos los lugares ocupados” guarda los identificadores de las observaciones
creadas por esa operación en su entrada de auditoría. “Deshacer marcado total”
vence sólo las observaciones todavía vigentes de ese último marcado total,
hecho por la misma cuenta y en la misma sala. No borra reportes, check-ins,
marcados selectivos anteriores ni modificaciones posteriores de otro admin.

La transacción vuelve a comprobar la operación. El cliente envía su identificador
para impedir que una pestaña desactualizada deshaga otra operación más reciente.
Repetir deshacer no hace nuevos cambios. La consulta de disponibilidad es privada
y funciona también después de recargar. Las consultas por IDs se dividen para
respetar el límite de parámetros de SQLite en Workers.

Los estados se recalculan con la evidencia que sigue vigente: no se extienden
reportes ya vencidos ni se reconstruyen presencias. Los marcados antiguos sin
identificadores exactos no se deshacen con un borrado global como alternativa.
No se requiere migración ni se modifican datos de producción para probarlo.

La selección múltiple muestra controles junto al mapa, casillas visibles y una
lista horizontal de lugares para quitar elementos individuales. Permite cancelar,
usar Escape y desmarcar la selección sin escribir en el servidor. Sólo al elegir
“Marcar ocupados” o “Marcar libres” se aplica el cambio y termina la selección.
Durante la petición se bloquean cambios de selección y acciones en paralelo.
Los check-ins activos se excluyen en la interfaz cuando se conocen y siempre se
vuelven a comprobar en la API. El gesto de arrastre del mapa no comienza sobre
un asiento, para conservar los toques al seleccionar con zoom.

Los permisos existentes de ADMIN/MODERATOR y las reglas de semillas se conservan:
estas operaciones masivas y su deshacer no generan recompensas.

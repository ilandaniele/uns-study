# Ambientación de Halloween

El mapa fotográfico de la sala principal incorpora una capa SVG decorativa del
25 de octubre al 1 de noviembre, ambos incluidos, según la hora de Bahía Blanca.
Se desactiva al comenzar el 2 de noviembre y vuelve en la siguiente temporada.
El cambio se comprueba cada minuto y al volver a la pestaña, sin recargar la sala.

Las calabazas y velas quedan junto a la entrada; las telarañas y murciélagos, en
la pared del fondo; los fantasmas, en el pasillo central. La capa se dibuja bajo
los asientos, no recibe clics ni foco y no altera sus coordenadas o estados.
Las animaciones se limitan a movimientos suaves y cambios de opacidad. Con
`prefers-reduced-motion: reduce` los adornos permanecen estáticos. No hay audio,
imágenes descargadas ni dependencias nuevas.

## Duración de los reportes

Desde este cambio, los reportes individuales nuevos «Está libre» duran 120 minutos,
igual que «Está ocupado». «Está guardado» conserva sus 30 minutos; las marcas de
administración Libre/Ocupado conservan sus 180 minutos. Las confirmaciones Libre
producidas por una votación usan también la constante compartida de 120 minutos.
Una presencia activa y las votaciones conservan sus reglas de prioridad.

Cada reporte conserva el vencimiento que recibió al crearse. Los reportes antiguos
de 15 minutos no se extienden ni se reactivan. El vencimiento los lleva a «Sin datos»
si no hay otra evidencia vigente; tampoco se revive actividad al abrir la app.

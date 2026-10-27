# Jardín nativo

El jardín vive en `/jardin`, separado del mapa de ocupación. Cada cuenta tiene
25 parcelas por cuenta. Sala, Foco, Jardín, Ranking y Más forman la navegación
principal; las páginas secundarias conservan sus rutas en Más.

## Reglas

- 30 semillas iniciales, sin escribir una fila hasta la primera acción.
- Una semilla por cada 6 minutos de estudio registrado (10 por hora).
- Las sesiones históricas cuentan para ganar semillas. Los créditos administrativos
  `MANUAL` y el tiempo del Pomodoro local no cuentan.
- El crecimiento usa el incremento de minutos registrados después de plantar.
  Todos los árboles crecen en paralelo. No crecen por comprar semillas ni por
  dejar el navegador abierto. Los check-ins activos se limitan a su vencimiento
  mediante el mismo cálculo de tiempo que el ranking; una sesión ya registrada
  nunca se cuenta otra vez como check-in activo.
- Cada especie tiene un precio, tiempo de crecimiento y recompensa de canje.
  Se pueden conservar árboles adultos o canjearlos para liberar su parcela.
  El canje agrega el ejemplar a la colección y se identifica por UUID del árbol,
  para que un reintento no canjee una nueva plantación en esa misma parcela.
- Las etapas son recién plantado, brote, joven y adulto. Los tiempos son reglas
  del juego, no tasas de crecimiento biológico.
- No hay transferencias de semillas, retiro de dinero ni plantaciones reales.

El catálogo compartido está en `packages/contracts/src/garden.ts` y
`garden-native-species.ts`: 36 especies nativas con nombre científico, región y
enlace botánico oficial. Incluye árboles, palmeras, arbustos, flores, pastos y cactus.
Las ilustraciones GPT se empaquetan en atlas WebP transparentes y se muestran
con dimensiones fijas, sin animación de follaje.

## Compras opcionales

El paquete aprobado es **100 semillas por $5.000 ARS**, en un pago único con
Checkout Pro de Mercado Pago. El precio y la cantidad se fijan en el servidor.

El checkout requiere sesión y las dos configuraciones de Mercado Pago ya usadas
por la app: acceso a la API y verificación de webhooks. El estado `enabled` de la
tienda indica si ambas están disponibles; el frontend deshabilita las compras si
falta alguna. Staging conserva su configuración separada.

1. El servidor guarda una orden con UUID y términos fijos, y crea la preferencia.
2. `external_reference` contiene `garden:<UUID de orden>`, sin datos personales.
3. El regreso del comprador sólo muestra el estado y reconsulta. Los parámetros
   de la URL nunca acreditan semillas.
4. El webhook existente verifica la firma y vuelve a consultar `/v1/payments/:id`.
5. Se comprueban orden, identificador de pago, moneda, importe y estado aprobado.
   La recepción y el ajuste del saldo se guardan en una misma transacción.
6. El identificador del proveedor evita créditos repetidos. Los reintegros
   parciales descuentan semillas proporcionalmente; los totales y contracargos
   revierten el crédito. Una notificación anterior a la última actualización del
   proveedor no restaura semillas reintegradas. Si ya se gastaron, el saldo puede
   quedar negativo hasta ganar o comprar más semillas.

No se guardan tarjetas, tokens de pago, email del pagador ni el payload completo.
La eliminación de la cuenta elimina sus parcelas, órdenes y recibos en la app.
Las donaciones y suscripciones conservan su tratamiento independiente.

## Implementación y validación

- `GET /api/v1/me/garden`: saldo, tiempo registrado, parcelas y colección.
- `POST /api/v1/me/garden/plant` y `/redeem`: mutaciones transaccionales.
- `GET /api/v1/me/garden/shop`: disponibilidad, precio y últimas cinco compras.
- `POST /api/v1/me/garden/checkout`: preferencia de pago única.
- Todas estas rutas requieren autenticación y responden `private, no-store`.
- Migraciones aditivas `0006_native_garden` y `0007_garden_payments`, incluidas
  en el bundle de migraciones del Durable Object existente.
- Pruebas de dominio e integración HTTP cubren saldo, concurrencia, crecimiento,
  propiedad de parcelas, validaciones, CSRF, firma de webhook, duplicados,
  importe/moneda, reintegros, reversión atómica y eliminación de cuenta.
- La revisión del navegador usa cuentas y pagos simulados. No realiza cobros.

El Pomodoro básico ahora es gratuito; combinaciones guardadas, sonidos avanzados,
estadísticas y herramientas de ventana conservan sus gates Pro.

## Bosque en perspectiva y visitas

El jardin usa una isla isometrica con ilustraciones originales de las mismas
36 especies nativas. Las 25 parcelas mantienen su numero, saldo, crecimiento y
canjes. Bosque, Vivero y Coleccion son accesos a las secciones de la pagina.
La seleccion tambien funciona por teclado y con un selector tactil de 44 px.

El jardin siempre se puede visitar desde el perfil, sin activar una opcion.
Esto tambien se aplica a los jardines existentes con user_gardens.shared=false,
sin migrar ni reescribir balances. El enlace Visitar jardin del perfil abre
/u/[userId]/jardin. Las visitas requieren sesion y respetan
bloqueos en ambos sentidos; la respuesta es private, no-store y no contiene
saldo, compras, minutos exactos, fechas de plantacion ni identidad del usuario.
La identidad visible se obtiene del perfil existente con sus permisos actuales.
Los bloqueos se comprueban despues de cargar el historial para impedir que
una visita en curso pase por alto un nuevo bloqueo. La ruta antigua de
visibilidad se conserva para clientes anteriores y devuelve shared=true.

Referencia de composicion: https://www.forestapp.cc/ (bosque isometrico y resumen
compacto). No se agregan dependencias ni imagenes de terceros para esta vista.

## Ilustracion botanica del vivero

TreeArt muestra recortes GPT de plantas adultas y jovenes en un SVG con clip
por celda. Las etapas tempranas distinguen arboles de hoja ancha, coniferas,
palmeras, cactus, hierbas y pastos. Las cuatro etapas mantienen el apoyo en
(128,270) y un viewport explicito evita que los atlas invadan otras parcelas.
La parcela determina el reflejo del dibujo para que propietario y visitantes
vean el mismo ejemplar. No se agregan dependencias ni fuentes.
Los prompts, fuentes, archivos y presupuestos se documentan en
[garden-tree-art.md](garden-tree-art.md) y [garden-expansion.md](garden-expansion.md).

Referencias de forma: SIB de Parques Nacionales (Araucaria araucana,
https://sib.gob.ar/index.php/especies/araucaria-araucana), Argentina.gob.ar
(ceibo, https://www.argentina.gob.ar/pais/ceibo) y Buenos Aires Ciudad
(jacaranda, https://buenosaires.gob.ar/gcaba_historico/arboles-nativos/jacaranda).
Son ilustraciones del juego, no representaciones de tiempos biologicos.

## Seleccion visual de parcelas

PlotPicker reemplaza el select nativo por una cuadricula desplegable de 5 x 5,
debajo de la escena: no superpone una lista encima del bosque. Las casillas
muestran numero, planta y seleccion, con botones tactiles y nombres accesibles.
Se cierra al elegir; admite flechas, Inicio/Fin y Escape, y devuelve el foco
al control. El panel permite cambiar de especie desde las tarjetas existentes
del vivero, conservando la parcela libre elegida. No cambia las reglas de juego.

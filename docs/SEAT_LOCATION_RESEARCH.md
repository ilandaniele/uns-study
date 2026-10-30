# Referencias para ubicar asientos — 30/10/2026

Se revisaron fuentes públicas de la UNS para el Complejo Alem y su sala de lectura.
No se obtuvo un plano acotado, vigente y georreferenciado de los 108 asientos de la
aplicación. No se activó una calibración con coordenadas deducidas de fotos o calles.

| Fuente pública | Información encontrada | Uso para la calibración |
| --- | --- | --- |
| [Complejo Alem y sectores](https://servicios.uns.edu.ar/proyectos/edificios/complejo_alem.asp) | Esquema de cuerpos y listados por piso, incluidos biblioteca y sala de lectura en cuerpo A | Orientación institucional; no da medidas ni coordenadas de sillas |
| [Biblioteca Central: salas de lectura](https://bc.uns.edu.ar/salasdelectura/) | Sala Manuel Gil en Alem 1253 e Islas Malvinas en Palihue | Distinguir establecimientos; no tiene relevamiento de mobiliario |
| [Plan Estratégico de la Biblioteca Central](https://ticketsbc.uns.edu.ar/attachments/download/9245/Plan%20Estrat%C3%A9gico%20de%20la%20Biblioteca%20Central.pdf) | Documento de 17 páginas, actualización indicada 14/02/2022, infraestructura y planes de desarrollo | No proporciona geometría georreferenciada de los asientos |
| [Referencia indexada: capacidad habilitada por espacios, 2021](https://www.cienciasdelasalud.uns.edu.ar/docs/CAPACIDAD%20HABILITADA%20POR%20ESPACIOS%2C%20rev%201%2003-08-2021.pdf) | El índice de búsqueda muestra una superficie de 162 m² para sala de lectura de Biblioteca Central en PB; la descarga directa devolvió 404 en esta revisión | No validada como documento descargable vigente. Un área tampoco define lados, orientación, centro o asientos; no se cargó en la app |

El enlace histórico de compras/licitaciones publicado por el sitio de la UNS
redirige mediante JavaScript a su portada; no permitió obtener el legajo de la sala.
Los proyectos públicos de salas nuevas, subsuelo y Campus Palihue no se toman como
relevamientos de esta sala. La falta de un plano encontrado no demuestra que no
exista: sólo delimita lo que pudo verificarse públicamente.

## Datos que aún hacen falta para activar una calibración real

- Centro geográfico verificado, escala en metros y orientación real del dibujo,
  o tres referencias de sillas medidas y no alineadas.
- Error total que incluya georreferenciación, dibujo y posiciones del mobiliario.
- Lecturas del dispositivo cuyo margen permita distinguir la silla de sus vecinas.

El centro de un geofence identifica cercanía, no acredita por sí solo precisión de
asiento. Una coordenada central permite trasladar el dibujo; escala y orientación
son datos independientes. El formato geométrico y el diagnóstico de precisión ya
están implementados, sin requerir QR ni modificar el mapa de la sala.

La [especificación W3C](https://www.w3.org/TR/geolocation/) define la precisión
informada en metros con confianza del 95 %. Solicitar alta precisión no garantiza
localización de interiores. No se promedia ni se reduce ese margen para convertir
una ubicación ambigua en una presencia automática.

# Verificación obligatoria del correo

En todos los Workers desplegados (`NODE_ENV=production`, incluido staging), una dirección de correo no es identidad hasta probar acceso al buzón.

## Ingreso y registro

- Los dominios de producción y dev redirigen HTTP a HTTPS antes de mostrar formularios o procesar autenticación. Es necesario tanto para las cookies seguras como para los orígenes/callbacks de Google. También se conserva la ruta y la query de enlaces anteriores; `www` lleva al dominio canónico. No se aceptan callbacks HTTP ni se amplía la lista de orígenes permitidos como solución alternativa. Una pestaña HTTP antigua se actualiza antes de enviar el formulario. El desarrollo local sigue permitiendo HTTP.

- El registro por email es primero email/nombre y después un código de seis dígitos. Better Auth crea la cuenta y su sesión sólo después de confirmar el código. No se crean cuentas pendientes por escribir una dirección ajena.
- Los usuarios ya verificados conservan su contraseña y Google. También pueden elegir ingresar con código. Las cuentas nuevas usan código o Google; pueden establecer una contraseña mediante el flujo existente de recuperación.
- Los códigos duran 10 minutos, tienen cinco intentos y son de un solo uso. Se guardan hasheados en la tabla de verificaciones existente. Un reenvío rota el código; el anterior deja de servir. No se guardan códigos, contraseñas ni tokens en storage del navegador, ni se imprimen en logs.
- El servidor aplica un minuto entre reenvíos, cinco solicitudes por email/hora, diez verificaciones por email/15 minutos y límites adicionales por IP. Los límites por hora y por 15 minutos persisten en SQLite; los buckets cortos usan la memoria del Durable Object mediante el servicio existente.
- Resend se espera hasta aceptar el envío. Better Auth captura errores de callbacks, por lo que un WeakSet del contexto de cada petición permite propagar un 503 desde el hook posterior, sin compartir resultados entre solicitudes. El cliente muestra error y permite reintentar, sin dar por enviado un código que falló.
- Si el correo no está configurado, se deshabilita el envío y el registro por email. No se habilitan registros sin verificar como fallback. Google y las contraseñas de cuentas ya verificadas siguen disponibles si están configurados.

## Regreso desde Google

El cliente indica un callback de éxito y otro de error, ambos del mismo origen, conservando sólo un destino interno seguro. Si el estado expiró o una pestaña anterior no indicó callback de error, el servidor vuelve al login de la app. Allí se distinguen cancelación, estado perdido, vinculación pendiente y restricciones, sin mostrar mensajes arbitrarios del proveedor. Se puede reiniciar Google en la misma ventana o elegir código por email cuando está disponible; una restricción no ofrece un acceso alternativo.

Una cuenta local con correo ya verificado puede vincular Google conservando su usuario y datos. Una cuenta local sin verificar necesita primero probar el buzón por el flujo de recuperación; no se relajan las comprobaciones de estado, PKCE, origen ni vinculación. Las pruebas HTTP completan el callback con Better Auth, Hono y SQLite reales, simulando únicamente el intercambio externo de Google: alta, vinculación, sesión utilizable, cancelación, código fallido, estados faltantes/vencidos/reutilizados y cuentas sin verificar o bloqueadas. Estas pruebas no equivalen a ingresar a la cuenta real de otra persona.

## Cuentas anteriores sin verificar

La migración de verificación no borra cuentas ni sus jardines, sesiones de estudio, compras o perfiles. Sus sesiones sin prueba de correo dejan de dar acceso autenticado a REST, administración, tokens de realtime y canales privados de WebSocket. El mapa público sigue disponible. Se muestra un aviso que lleva a confirmar el email.

El dueño puede eliminar individualmente una cuenta desde Administración → Usuarios, confirmando su correo. El servidor vuelve a comprobar la identidad verificada del dueño, bloquea cuentas del equipo/blindadas, presencias activas y cualquier historial de compras o suscripción. El borrado y la auditoría sin nombre/correo son una transacción; se aplican las políticas de borrado existentes de cada tabla. No hay borrado masivo ni una lista de correos reales en el código. Better Auth consulta la sesión canónica sin caché de cookies para que las sesiones eliminadas dejen de dar acceso REST inmediatamente; WebSocket conserva sus comprobaciones de sesión en base de datos.

El código prueba control del buzón, no la identidad legal de la persona. Un correo temporal puede recibir códigos; no se bloquean automáticamente dominios ni redes compartidas de la sala. Para abuso persistente, usar moderación por comportamiento y un desafío Turnstile adaptativo, sin desactivar la verificación ni bajar sus límites.

El ingreso OTP de Better Auth 1.7.8 elimina los vínculos de acceso y revoca las sesiones de una cuenta anterior sin verificar **antes** de marcar el correo como verificado y crear la sesión del dueño. Así no queda activa una contraseña que pudo elegir otra persona. Se bloquean los endpoints alternativos de verificación por enlace/OTP que marcarían el correo verificado sin esa limpieza. La recuperación por contraseña conserva su flujo de prueba por email y reemplazo de contraseña.

Los perfiles y contenidos anteriores no prueban quién controlaba el buzón. Se conservan para evitar eliminar datos reales, y siguen sujetos a moderación. No se infiere que un correo extraño sea falso ni se bloquean dominios por apariencia.

## Desarrollo y pruebas

Sólo las ejecuciones locales no productivas conservan el alta por contraseña sin servicio de mail para los E2E existentes. La condición depende del servidor, nunca de un flag enviado por el cliente ni de la disponibilidad de Resend.

Staging no tiene Resend configurado actualmente: debe mostrar el aviso de indisponibilidad y rechazar el envío, sin crear cuentas. No se agregan secretos ni se cambian los wrangler.jsonc. La entrega y recuperación se prueban con Better Auth real, SQLite y Resend simulado localmente. Las pruebas de navegador interceptan los envíos; no se mandan correos a terceros.

Pruebas específicas: alta sólo tras prueba, hash y vencimiento, aislamiento por dirección, cinco intentos, un solo uso, reenvío/rotación, sesiones anteriores, recuperación sin credenciales ajenas, contraseñas verificadas y falta/error del proveedor. También se comprueban mobile/desktop y los errores/reintentos del formulario.

Referencia: [Email OTP de Better Auth](https://better-auth.com/docs/plugins/email-otp). Se contrastó con el código de la versión instalada.

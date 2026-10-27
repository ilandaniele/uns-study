# Verificación obligatoria del correo

En todos los Workers desplegados (`NODE_ENV=production`, incluido staging), una dirección de correo no es identidad hasta probar acceso al buzón.

## Ingreso y registro

- El registro por email es primero email/nombre y después un código de seis dígitos. Better Auth crea la cuenta y su sesión sólo después de confirmar el código. No se crean cuentas pendientes por escribir una dirección ajena.
- Los usuarios ya verificados conservan su contraseña y Google. También pueden elegir ingresar con código. Las cuentas nuevas usan código o Google; pueden establecer una contraseña mediante el flujo existente de recuperación.
- Los códigos duran 10 minutos, tienen cinco intentos y son de un solo uso. Se guardan hasheados en la tabla de verificaciones existente. Un reenvío rota el código; el anterior deja de servir. No se guardan códigos, contraseñas ni tokens en storage del navegador, ni se imprimen en logs.
- El servidor aplica un minuto entre reenvíos, cinco solicitudes por email/hora, diez verificaciones por email/15 minutos y límites adicionales por IP. Los límites por hora y por 15 minutos persisten en SQLite; los buckets cortos usan la memoria del Durable Object mediante el servicio existente.
- Resend se espera hasta aceptar el envío. Better Auth captura errores de callbacks, por lo que un WeakSet del contexto de cada petición permite propagar un 503 desde el hook posterior, sin compartir resultados entre solicitudes. El cliente muestra error y permite reintentar, sin dar por enviado un código que falló.
- Si el correo no está configurado, se deshabilita el envío y el registro por email. No se habilitan registros sin verificar como fallback. Google y las contraseñas de cuentas ya verificadas siguen disponibles si están configurados.

## Cuentas anteriores sin verificar

No se borran cuentas ni sus jardines, sesiones de estudio, compras o perfiles. Sus sesiones sin prueba de correo dejan de dar acceso autenticado a REST, administración, tokens de realtime y canales privados de WebSocket. El mapa público sigue disponible. Se muestra un aviso que lleva a confirmar el email.

El ingreso OTP de Better Auth 1.7.8 elimina los vínculos de acceso y revoca las sesiones de una cuenta anterior sin verificar **antes** de marcar el correo como verificado y crear la sesión del dueño. Así no queda activa una contraseña que pudo elegir otra persona. Se bloquean los endpoints alternativos de verificación por enlace/OTP que marcarían el correo verificado sin esa limpieza. La recuperación por contraseña conserva su flujo de prueba por email y reemplazo de contraseña.

Los perfiles y contenidos anteriores no prueban quién controlaba el buzón. Se conservan para evitar eliminar datos reales, y siguen sujetos a moderación. No se infiere que un correo extraño sea falso ni se bloquean dominios por apariencia.

## Desarrollo y pruebas

Sólo las ejecuciones locales no productivas conservan el alta por contraseña sin servicio de mail para los E2E existentes. La condición depende del servidor, nunca de un flag enviado por el cliente ni de la disponibilidad de Resend.

Staging no tiene Resend configurado actualmente: debe mostrar el aviso de indisponibilidad y rechazar el envío, sin crear cuentas. No se agregan secretos ni se cambian los wrangler.jsonc. La entrega y recuperación se prueban con Better Auth real, SQLite y Resend simulado localmente. Las pruebas de navegador interceptan los envíos; no se mandan correos a terceros.

Pruebas específicas: alta sólo tras prueba, hash y vencimiento, aislamiento por dirección, cinco intentos, un solo uso, reenvío/rotación, sesiones anteriores, recuperación sin credenciales ajenas, contraseñas verificadas y falta/error del proveedor. También se comprueban mobile/desktop y los errores/reintentos del formulario.

Referencia: [Email OTP de Better Auth](https://better-auth.com/docs/plugins/email-otp). Se contrastó con el código de la versión instalada.

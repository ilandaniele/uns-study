# Insignias: otorgamiento y visibilidad

Revisión del 10/11/2026.

- Registrarse no otorga insignias. El catálogo privado incluye metas pendientes y ganadas, con estados distintos. Las pendientes se muestran en gris y con «Por conseguir».
- «Primera cebada» requiere al menos un minuto real registrado; una sesión con cero minutos o un ajuste manual no sirve para ese logro ni para los de horario. Las demás metas conservan sus umbrales de horas, rachas y colaboración. Los logros históricos pueden obtenerse al consultar la colección.
- El historial de insignias ya conseguidas se conserva. Esta revisión no borra premios existentes ni modifica minutos, roles, recompensas o Pro.
- `user_privacy_settings.show_achievements` comienza en false, también para cuentas existentes mediante migración aditiva. La persona puede activar «Mostrar mis insignias» desde Perfil → Privacidad. Se guarda por cuenta y funciona en todos sus dispositivos.
- Las insignias públicas requieren ese consentimiento; los perfiles además respetan la visibilidad de actividad y los bloqueos. Los alias no revelan el identificador de la cuenta. La respuesta pública no incluye insignias ocultas; tampoco se envía una insignia destacada en el ranking cuando están desactivadas. La preferencia se vuelve a comprobar después de lecturas asíncronas.
- Ocultarlas no saca a la persona del ranking ni afecta a su colección privada. La insignia de administración mantiene su ajuste propio.

Validación: pruebas de usuario sin actividad, sesiones de cero minutos, consentimiento por HTTP, alias, ranking, cambio de privacidad durante una visita y conservación de premios.

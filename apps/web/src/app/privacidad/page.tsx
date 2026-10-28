import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { LEGAL_CONTACT, LEGAL_DATE_LABEL, PROJECT_HOLDER } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Política de privacidad</h1>
      <p className="text-xs text-muted">Actualizada el {LEGAL_DATE_LABEL}.</p>
      <p>
        Sala de Estudio es un proyecto independiente de estudiantes para compartir en tiempo real la
        disponibilidad de lugares en la sala de estudio. No es un servicio oficial de la Universidad Nacional del
        Sur.
      </p>
      <p>El responsable del tratamiento es {PROJECT_HOLDER}. Podés contactarlo en <a href={`mailto:${LEGAL_CONTACT}`} className="break-all text-primary underline">{LEGAL_CONTACT}</a>.</p>

      <h2 className="pt-2 text-lg font-semibold text-main">Qué datos guardamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Cuenta: nombre y email. Si entrás con Google, recibimos sólo tu nombre, email y foto de perfil.</li>
        <li>Perfil: los campos que vos completes (apodo, carrera, materia, bio, Instagram, legajo). Todos son opcionales y privados por defecto.</li>
        <li>Actividad en la sala: check-ins (&quot;Estoy acá&quot;), observaciones de lugares, mensajes de chat y reportes.</li>
        <li>Insignias y colaboración: logros conseguidos, fecha de obtención, confirmación de que los viste y lugares distintos actualizados por día para calcular recompensas de semillas. No se guardan coordenadas en este registro.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold text-main">Jardín virtual y compras</h2>
      <p>La capacidad de parcelas y el paisaje de tu jardín también se muestran a sus visitantes. Las ampliaciones se compran con semillas virtuales.</p>
      <p>Tu jardín se puede visitar desde tu perfil por otras personas registradas en la app. Sólo se muestran las plantas y la colección: tu saldo, tus compras y tu tiempo de estudio no forman parte de esa visita. Los bloqueos entre usuarios también impiden visitar sus jardines. Guardamos tus parcelas, plantas, colección y saldo de semillas en tu cuenta. Para calcular el crecimiento usamos el tiempo de presencia ya registrado en la sala.</p>
      <p>Si comprás semillas, Mercado Pago procesa el pago. Guardamos la referencia de compra, el importe, el identificador y estado del pago y las semillas acreditadas; no recibimos ni guardamos los datos de tu tarjeta. El jardín y sus registros de compra en la app se eliminan al borrar tu cuenta.</p>
      <h2 className="pt-2 text-lg font-semibold text-main">Reloj de foco</h2>
      <p>Si iniciás sesión, guardamos el estado del reloj, sus ajustes y hasta 120 días de estadísticas personales del Pomodoro para mantenerlos sincronizados entre tus dispositivos. Son datos privados de tu cuenta y se eliminan al borrarla. Las tareas, los sonidos y las combinaciones personalizadas se guardan en cada dispositivo. El tiempo del Pomodoro no acredita presencia ni horas verificadas en la sala.</p>

      <h2 className="pt-2 text-lg font-semibold text-main">Ubicación</h2>
      <p>
        Usamos tu ubicación sólo en el momento de marcar un lugar, para comprobar que estás cerca de la sala. No
        guardamos tus coordenadas exactas ni las mostramos a otras personas: sólo conservamos la precisión del GPS y si
        estabas dentro del área.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-main">Quién ve tus datos</h2>
      <p>
        Otras personas registradas sólo ven lo que vos elijas mostrar en tu perfil. La evidencia de reportes es privada
        y sólo la ve el equipo de moderación. No vendemos tus datos. Para prestar el servicio usamos los proveedores que se indican a continuación, además de las herramientas de publicidad y estadísticas descritas en esta política.
      </p>

      <p>Sólo el súper admin (titular y desarrollador de la app) puede consultar los datos guardados de cuenta, perfil, preferencias y presencia actual, incluidos los ocultos en el perfil público, para administrar y moderar la app. Estas consultas quedan registradas en auditoría. Este acceso no hace públicos esos datos. Los administradores de la sala y moderadores no pueden consultar esta vista.</p>
      <p>Si activás la visibilidad del ranking, otras personas registradas pueden ver tu actividad e insignias en el perfil. Cuando usás un alias, el enlace abre un perfil con ese alias, sin publicar el identificador de tu cuenta, nombre, correo o rol. Podés ocultar esta actividad desde la opción &quot;Mostrar ranking, actividad e insignias&quot; de tu perfil. Los bloqueos también se respetan en estas visitas.</p>

      <h2 id="verificacion-foto" className="pt-2 text-lg font-semibold text-main">Verificación opcional por foto</h2>
      <p>Si elegís verificar tu lugar, primero podés revisar la foto y confirmar el envío. La imagen se procesa con Google Gemini o Anthropic Claude, según el proveedor que indica la pantalla antes de enviarla. Eliminamos los metadatos de la imagen y no guardamos la foto en la app: conservamos el resultado, su momento, el modelo y una huella digital para impedir reutilizaciones. El procesamiento por el proveedor se rige por sus condiciones; el servicio gratuito de Gemini puede usar el contenido para mejorar productos. Evitá incluir personas, pantallas o datos privados. La verificación es opcional y no hace falta para usar tu lugar.</p>

      <h2 className="pt-2 text-lg font-semibold text-main">Proveedores que intervienen</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Cloudflare aloja la app, la API y el almacenamiento, y proporciona la comprobación de seguridad Turnstile en los flujos que la requieren.</li>
        <li>Resend procesa el envío de códigos de acceso y otros correos de la app, incluyendo la dirección destinataria y el contenido necesario para el envío.</li>
        <li>Si elegís entrar con Google, Google interviene en la autenticación. Google Analytics y AdSense tienen las finalidades indicadas en la sección de cookies.</li>
        <li>Mercado Pago procesa las compras y suscripciones opcionales. Borrar tu cuenta en esta app no elimina por sí mismo los registros que conserve el proveedor de pagos.</li>
      </ul>
      <p>Estos servicios pueden implicar tratamiento de información fuera de Argentina. Para consultas sobre los destinatarios o el tratamiento de tus datos, usá el canal de privacidad indicado abajo.</p>

      <h2 className="pt-2 text-lg font-semibold text-main">Cookies, publicidad y estadísticas</h2>
      <p>
        Usamos cookies propias para mantener tu sesión iniciada y recordar preferencias como el tema. Para medir el uso
        del sitio usamos Google Analytics. También contamos aperturas por sección para mejorar la app: guardamos únicamente el día, la sección y un total agregado durante un máximo de 30 días, sin asociarlo con tu cuenta, IP, URL privada o mensajes. Este contador respeta las señales Do Not Track y Global Privacy Control del navegador.
      </p>
      <p>
        En algunas páginas con contenido (como las guías de estudio y las novedades de la comunidad) mostramos anuncios de
        Google AdSense. Google y sus socios usan cookies para mostrar anuncios según tus visitas anteriores a este y a
        otros sitios. Podés desactivar la publicidad personalizada en la{" "}
        <a className="text-primary underline" href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
          configuración de anuncios de Google
        </a>{" "}
        y leer cómo Google usa estos datos en{" "}
        <a
          className="text-primary underline"
          href="https://policies.google.com/technologies/partner-sites"
          target="_blank"
          rel="noopener noreferrer"
        >
          policies.google.com/technologies/partner-sites
        </a>
        . Con la suscripción Pro no se muestran anuncios.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-main">Conservación y borrado</h2>
      <p>
        Podés eliminar tu cuenta desde tu perfil; eso borra tu perfil, check-ins y mensajes. Para los eventos de seguridad
        está previsto un plazo de 180 días y para la evidencia de reportes, 180 días después de su resolución, pero el
        borrado periódico por esos plazos todavía no está implementado. Podés solicitar la revisión o supresión de esos
        datos mediante el canal de privacidad; se evaluará tu pedido conforme a los derechos y excepciones legales aplicables.
      </p>

      <section id="tus-derechos" className="scroll-mt-24 space-y-3 rounded-3xl border border-app bg-surface p-5">
        <h2 className="text-lg font-semibold text-main">Tus derechos sobre los datos</h2>
        <p>Podés solicitar acceso, rectificación, actualización o supresión de tus datos escribiendo a <a href={`mailto:${LEGAL_CONTACT}?subject=${encodeURIComponent("Solicitud sobre mis datos — Sala de Estudio")}`} className="break-all text-primary underline">{LEGAL_CONTACT}</a>. Indicá qué necesitás y el correo de tu cuenta. Para protegerla, podremos comprobar tu identidad por un medio razonable; no envíes contraseñas, códigos de acceso ni documentos de identidad en el primer mensaje.</p>
        <p>El plazo legal de respuesta a una solicitud de acceso es de diez días corridos; para rectificación, actualización o supresión, de cinco días hábiles. La supresión puede estar sujeta a las excepciones legales aplicables.</p>
        <p>La Agencia de Acceso a la Información Pública es la autoridad de control en Argentina. Podés consultar <a href="https://www.argentina.gob.ar/aaip/datospersonales/derechos" target="_blank" rel="noopener noreferrer" className="text-primary underline">cómo ejercer tus derechos y presentar un reclamo ante la AAIP</a>.</p>
      </section>

      <h2 className="pt-2 text-lg font-semibold text-main">Créditos</h2>
      <p>
        Las ilustraciones de animales y los emojis gráficos son de Twemoji (Graphics by Twemoji, © Twitter, Inc. y
        otros colaboradores), bajo licencia{" "}
        <a className="text-primary underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
          CC-BY 4.0
        </a>
        .
      </p>

      <p><Link href="/propiedad-intelectual#creditos" className="text-primary underline">Ver todos los créditos y avisos de licencias</Link>.</p>

      <h2 className="pt-2 text-lg font-semibold text-main">Contacto</h2>
      <p>
        Por consultas sobre tus datos escribí a{" "}
        <a className="break-all text-primary underline" href={`mailto:${LEGAL_CONTACT}`}>
          {LEGAL_CONTACT}
        </a>
        . También podés usar el formulario de{" "}
        <Link className="text-primary underline" href="/sugerencias">
          sugerencias y contacto
        </Link>
        .
      </p>
    </main>
  );
}

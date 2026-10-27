import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Política de privacidad</h1>
      <p>
        Sala de Estudio es un proyecto independiente de estudiantes para compartir en tiempo real la
        disponibilidad de lugares en la sala de estudio. No es un servicio oficial de la Universidad Nacional del
        Sur.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-main">Qué datos guardamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Cuenta: nombre y email. Si entrás con Google, recibimos sólo tu nombre, email y foto de perfil.</li>
        <li>Perfil: los campos que vos completes (apodo, carrera, materia, bio, Instagram, legajo). Todos son opcionales y privados por defecto.</li>
        <li>Actividad en la sala: check-ins (&quot;Estoy acá&quot;), observaciones de lugares, mensajes de chat y reportes.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold text-main">Jardín virtual y compras</h2>
      <p>Tu jardín se puede visitar desde tu perfil por otras personas registradas en la app. Sólo se muestran las plantas y la colección: tu saldo, tus compras y tu tiempo de estudio no forman parte de esa visita. Los bloqueos entre usuarios también impiden visitar sus jardines. Guardamos tus parcelas, plantas, colección y saldo de semillas en tu cuenta. Para calcular el crecimiento usamos el tiempo de presencia ya registrado en la sala.</p>
      <p>Si comprás semillas, Mercado Pago procesa el pago. Guardamos la referencia de compra, el importe, el identificador y estado del pago y las semillas acreditadas; no recibimos ni guardamos los datos de tu tarjeta. El jardín y sus registros de compra en la app se eliminan al borrar tu cuenta.</p>

      <h2 className="pt-2 text-lg font-semibold text-main">Ubicación</h2>
      <p>
        Usamos tu ubicación sólo en el momento de marcar un lugar, para comprobar que estás cerca de la sala. No
        guardamos tus coordenadas exactas ni las mostramos a otras personas: sólo conservamos la precisión del GPS y si
        estabas dentro del área.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-main">Quién ve tus datos</h2>
      <p>
        Otras personas registradas sólo ven lo que vos elijas mostrar en tu perfil. La evidencia de reportes es privada
        y sólo la ve el equipo de moderación. No vendemos tus datos ni los compartimos con terceros, salvo lo que se explica sobre cookies y publicidad.
      </p>

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
        Podés eliminar tu cuenta desde tu perfil en cualquier momento; eso borra tu perfil, check-ins y mensajes. Los
        eventos de seguridad se conservan hasta 180 días y la evidencia de reportes hasta 180 días después de
        resuelto el reporte.
      </p>

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
        <a className="text-primary underline" href="mailto:ilan.daniele@gmail.com">
          ilan.daniele@gmail.com
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

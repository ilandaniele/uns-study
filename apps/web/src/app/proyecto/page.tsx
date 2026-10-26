import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { ROOM_HOURS_COPY } from "@/features/help/room-hours-copy";

export const metadata: Metadata = {
  title: "El proyecto y cómo funciona la sala",
  description: "Qué es Sala de Estudio, cómo interpretar la disponibilidad de lugares en Bahía Blanca, horarios, funcionamiento del proyecto y formas de contacto.",
  alternates: { canonical: "/proyecto" },
};

const link = "font-semibold text-primary underline underline-offset-4";

export default function ProjectPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:pt-10">
      <BackButton fallbackHref="/" showLabel />
      <article className="mt-6 space-y-7 text-sm leading-relaxed text-main sm:text-base">
        <header className="space-y-3">
          <p className="t-label text-primary">Un proyecto independiente</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Información para compartir mejor la sala</h1>
          <p className="text-muted">Sala de Estudio reúne un mapa colaborativo de lugares, herramientas de enfoque y guías para quienes estudian en Bahía Blanca. Podés consultar la disponibilidad antes de salir y ayudar a mantenerla actualizada cuando llegás.</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Para qué sirve el mapa</h2>
          <p>La pregunta es sencilla: ¿hay algún lugar para sentarme? La respuesta cambia durante el día. El mapa organiza las mesas y los asientos para que las personas que están en la sala puedan compartir lo que ven. Las actualizaciones se transmiten a quienes están consultando la página.</p>
          <p>Es una herramienta comunitaria, no un sistema de reservas ni un registro oficial de ocupación. Un lugar marcado como libre puede ocuparse antes de que llegues. El proyecto no representa a la Universidad Nacional del Sur ni administra el edificio.</p>
          <Link href="/" className={`inline-flex min-h-11 items-center ${link}`}>Consultar la sala</Link>
        </section>

        <section className="space-y-3 rounded-3xl border border-app bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-bold">Horarios de referencia</h2>
          <p>{ROOM_HOURS_COPY}</p>
          <p className="text-muted">Los horarios se interpretan en la hora local de Bahía Blanca. Cuando la sala está cerrada, la app lo indica y las presencias dejan de representar personas que siguen sentadas. Una modificación excepcional del funcionamiento del edificio puede requerir actualizar esta información.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Cómo interpretar lo que ves</h2>
          <dl className="space-y-3">
            <div><dt className="font-semibold">Libre</dt><dd className="text-muted">Hay una observación reciente de que el asiento está disponible. Revisá también cuándo se actualizó.</dd></div>
            <div><dt className="font-semibold">Ocupado</dt><dd className="text-muted">Alguien se marcó sentado o una persona observó que el lugar está ocupado. Un reporte de ocupación dura dos horas; un registro personal dura tres horas salvo renovación o una duración distinta habilitada en la app.</dd></div>
            <div><dt className="font-semibold">Guardado</dt><dd className="text-muted">Se vieron pertenencias sin una persona sentada. Es una descripción de la situación, no una reserva que otorgue la app.</dd></div>
            <div><dt className="font-semibold">Dudoso</dt><dd className="text-muted">La información necesita confirmación, por ejemplo porque hay reportes en conflicto o una votación abierta.</dd></div>
            <div><dt className="font-semibold">Sin datos</dt><dd className="text-muted">Falta información vigente. No significa que el lugar esté libre ni que esté ocupado.</dd></div>
          </dl>
          <p>Por ejemplo, si no hay lugares libres confirmados pero varios figuran sin datos, el mapa no permite concluir que la sala esté llena. En cambio, una observación reciente de alguien que está ahí aporta información útil para decidir si acercarte.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Cómo colaborar cuando llegás</h2>
          <p>La consulta del mapa y la lectura de las guías son públicas. Para marcar un lugar necesitás iniciar sesión. Tocá el asiento en el mapa para abrir su detalle: desde ahí podés informar lo que ves o elegir «Estoy acá» si ya estás sentado.</p>
          <p>«Estoy acá» registra tu presencia en un solo asiento. La ubicación del navegador se usa para comprobar que estás cerca de la sala, no para determinar en qué silla estás. Si te vas, tocá «Me voy»; si seguís estudiando cuando está por vencer el registro, podés renovarlo.</p>
          <p>Si alguien figura sentado pero se fue, otros reportes pueden abrir una votación. Las personas con un lugar marcado pueden ayudar a confirmar la situación. Ver pertenencias sin una persona no equivale a confirmar que el lugar está libre.</p>
          <Link href="/como-usar" className={`inline-flex min-h-11 items-center ${link}`}>Ver instrucciones y preguntas frecuentes</Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Herramientas para tu tiempo de estudio</h2>
          <p>Foco permite organizar bloques de trabajo y descansos. Las guías proponen maneras de preparar un final, practicar ejercicios, leer y repasar. El jardín representa el tiempo de presencia registrado con árboles nativos argentinos: sus semillas y ejemplares son virtuales.</p>
          <p>El temporizador de Foco y el registro «Estoy acá» cumplen funciones distintas. Usar el temporizador por sí solo no acredita horas de presencia para hacer crecer el jardín. Compartir un jardín es opcional y no muestra el saldo de semillas ni los horarios personales de estudio.</p>
          <div className="flex flex-wrap gap-x-6"><Link href="/foco" className={`inline-flex min-h-11 items-center ${link}`}>Ir a Foco</Link><Link href="/guias" className={`inline-flex min-h-11 items-center ${link}`}>Leer las guías</Link></div>
        </section>

        <section id="contenido" className="scroll-mt-24 space-y-3 border-t border-app pt-6">
          <h2 className="text-xl font-bold">Sobre las guías y las ilustraciones</h2>
          <p>Las guías de Sala de Estudio son material de apoyo con ejemplos para adaptar a tu materia y al tiempo que tenés. Incluyen lecturas complementarias de universidades y otras fuentes identificadas al final de cada artículo. Esas instituciones no patrocinan ni avalan esta app.</p>
          <p>Se utilizan herramientas de inteligencia artificial para asistir la redacción y crear ilustraciones, incluidos los árboles del jardín. Los textos no se presentan como publicaciones de una cátedra ni como asesoramiento profesional. Priorizá el programa y la bibliografía de tu materia; las guías sobre bienestar tampoco reemplazan una consulta de salud.</p>
          <p>Si encontrás una explicación incorrecta o un enlace que dejó de funcionar, enviá el título de la guía y el fragmento a corregir por el canal de contacto. La fecha de cada artículo corresponde a su contenido; las lecturas complementarias indican cuándo se consultaron.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Cómo se sostiene el proyecto</h2>
          <p>La consulta de la sala, el temporizador básico y el jardín forman parte de la experiencia gratuita. Hay funciones Pro, donaciones y compras opcionales de semillas para ayudar a sostener el desarrollo. Comprar semillas no reserva asientos ni acelera las horas necesarias para que crezcan los árboles.</p>
          <p>La publicidad se identifica como tal y está separada de las instrucciones y los controles. Los anuncios no deciden el estado de un asiento ni el resultado de una votación. Podés consultar las condiciones en los <Link href="/terminos" className={link}>términos de uso</Link>.</p>
        </section>

        <section className="space-y-3 rounded-3xl border border-app bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-bold">Contacto y mantenimiento</h2>
          <p>Para informar un error, proponer una corrección o consultar sobre el proyecto, escribí a <a href="mailto:ilan.daniele@gmail.com" className={`${link} break-all`}>ilan.daniele@gmail.com</a> o usá el <Link href="/sugerencias" className={link}>formulario de sugerencias y contacto</Link>. Si reportás un problema de la app, contá en qué pantalla pasó y qué pasos permiten repetirlo.</p>
          <p>El código del proyecto es público: <a href="https://github.com/ilandaniele/uns-study" target="_blank" rel="noopener noreferrer" className={link}>repositorio de Sala de Estudio</a>. Allí se puede consultar cómo se mantiene la aplicación.</p>
          <Link href="/privacidad" className={`inline-flex min-h-11 items-center ${link}`}>Consultar la política de privacidad</Link>
        </section>
      </article>
    </main>
  );
}

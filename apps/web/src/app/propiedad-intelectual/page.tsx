import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { LEGAL_CONTACT, LEGAL_DATE_LABEL, PROJECT_HOLDER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Propiedad intelectual y créditos",
  description: "Titularidad del proyecto, usos permitidos, derechos de terceros y créditos de Sala de Estudio.",
  alternates: { canonical: "/propiedad-intelectual" },
};
const link = "font-semibold text-primary underline underline-offset-4";

export default function IntellectualPropertyPage() {
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-sm leading-relaxed text-main sm:text-base">
    <BackButton fallbackHref="/mas" showLabel />
    <header className="space-y-3">
      <h1 className="text-3xl font-bold tracking-tight">Propiedad intelectual y créditos</h1>
      <p className="text-sm text-muted">Actualizado el {LEGAL_DATE_LABEL}.</p>
      <p>El responsable de Sala de Estudio es {PROJECT_HOLDER}. La reserva de derechos comprende únicamente sus aportes originales protegibles y sobre los que tenga derechos suficientes. El proyecto es independiente y no representa a la Universidad Nacional del Sur ni administra el edificio.</p>
    </header>

    <section className="space-y-3 rounded-3xl border border-app bg-surface p-5 sm:p-6">
      <h2 className="text-xl font-bold">Usar la app y compartirla</h2>
      <p>Podés utilizar las funciones del servicio y las copias técnicas que necesita tu navegador o la PWA, conforme a los <Link href="/terminos" className={link}>términos de uso</Link>. Respecto de los aportes propios del proyecto, también se permite compartir enlaces y capturas de tu experiencia, respetando los derechos y la privacidad de otras personas.</p>
      <p>Ese permiso no autoriza a redistribuir código o recursos protegidos para ofrecer una réplica del servicio, venderlos o atribuirse su autoría. Los usos que requieran autorización deben acordarse por escrito, salvo que ya estén permitidos por la ley o por una licencia aplicable.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-bold">Código, identidad e ideas</h2>
      <p>La publicación del repositorio permite consultar el proyecto y respeta los permisos de visualización y fork que resulten de los términos de GitHub. No constituye una licencia general de código abierto sobre los aportes propios. Las licencias de componentes ajenos siguen vigentes.</p>
      <p>La reserva no abarca ideas o funciones generales, datos de hecho ni nombres de especies. Tampoco impide desarrollar de forma independiente otras herramientas de estudio. La denominación y el logo identifican este proyecto; su uso no debe generar confusión sobre una afiliación o procedencia inexistente. No se afirma aquí que exista una marca registrada o una patente concedida.</p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-bold">Tus contenidos siguen siendo tuyos</h2>
      <p>Publicar un mensaje, una fotografía o un avatar no transfiere su propiedad al responsable de la app. Necesitamos los permisos limitados de almacenamiento, tratamiento y visualización necesarios para ofrecer las funciones que elegís, conforme a tus ajustes y a la <Link href="/privacidad" className={link}>política de privacidad</Link>. Esto no autoriza su venta ni usos ajenos al servicio.</p>
    </section>

    <section id="creditos" className="scroll-mt-24 space-y-3 rounded-3xl border border-app bg-surface p-5 sm:p-6">
      <h2 className="text-xl font-bold">Créditos y licencias de terceros</h2>
      <ul className="list-disc space-y-3 pl-5">
        <li>Los avatares de animales y los emojis gráficos son de Twemoji, © Twitter, Inc. y otros colaboradores, bajo <a href="https://creativecommons.org/licenses/by/4.0/" className={link} target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Se copian y renombran SVG para la app. <a href="https://github.com/jdecked/twemoji" className={link} target="_blank" rel="noopener noreferrer">Proyecto original</a>.</li>
        <li>La fuente Archivo corresponde a The Archivo Project Authors / Omnibus-Type. Geist Mono corresponde a Vercel, en colaboración con basement.studio. Ambas se distribuyen bajo SIL Open Font License 1.1.</li>
        <li>Los iconos de interfaz son de Phosphor, distribuidos mediante su paquete React bajo licencia MIT.</li>
        <li>Las bibliotecas y demás componentes conservan sus respectivos titulares y licencias. <a href="/legal/third-party-notices.txt" className={link}>Leer los avisos completos de componentes y fuentes</a>.</li>
      </ul>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-bold">Ilustraciones y asistencia de IA</h2>
      <p>Se utilizan herramientas de IA para asistir el desarrollo y la redacción, y para generar ilustraciones como las plantas del jardín. No se afirma exclusividad autoral automática sobre todos esos resultados ni se atribuye al proyecto la autoría de obras ajenas usadas como referencia. Las imágenes, fotografías y textos de terceros conservan sus derechos.</p>
    </section>

    <section className="space-y-3 border-t border-app pt-6">
      <h2 className="text-xl font-bold">Permisos y consultas sobre derechos</h2>
      <p>Para solicitar autorización o señalar un recurso que consideres utilizado sin permiso, escribí a <a href={`mailto:${LEGAL_CONTACT}`} className={`${link} break-all`}>{LEGAL_CONTACT}</a>. Indicá el recurso, el enlace y la información que permita revisar tu solicitud. No publiques documentos de identidad ni datos sensibles en comentarios o repositorios.</p>
      <p className="text-xs text-muted">© 2026 {PROJECT_HOLDER}. Derechos reservados sobre los aportes propios protegibles, con las licencias y excepciones aquí indicadas.</p>
    </section>
  </main>;
}

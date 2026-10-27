import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";
import Link from "next/link";
import { LEGAL_CONTACT, LEGAL_DATE_LABEL, PROJECT_HOLDER } from "@/lib/legal";

export const metadata: Metadata = { title: "Términos de uso" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Términos de uso</h1>
      <p className="text-xs text-muted">Actualizados el {LEGAL_DATE_LABEL}.</p>
      <p>Sala de Estudio es un proyecto independiente de {PROJECT_HOLDER}. No representa a la Universidad Nacional del Sur ni administra el edificio. Contacto: <a href={`mailto:${LEGAL_CONTACT}`} className="break-all text-primary underline">{LEGAL_CONTACT}</a>.</p>
      <h2 className="pt-2 text-lg font-semibold">Uso del servicio</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>La información de ocupación es colaborativa y aproximada. No es una reserva ni garantiza que un lugar esté libre.</li>
        <li>&quot;Estoy acá&quot; significa que estás sentado en ese lugar ahora. No se pueden guardar lugares para otras personas.</li>
        <li>No publiques información falsa, contenido ofensivo ni acoso. Podemos limitar o suspender cuentas que lo hagan.</li>
        <li>La información puede contener errores o quedar desactualizada. El servicio puede requerir mantenimiento o cambios. Estas condiciones no excluyen responsabilidades ni derechos que la ley no permita limitar.</li>
        <li>El jardín es un juego personal: sus árboles y semillas son virtuales. No representan plantaciones reales, dinero retirable ni lugares reservados. El crecimiento requiere tiempo de presencia registrado en la sala.</li>
        <li>Podés obtener semillas estudiando o comprar opcionalmente un paquete de 100 semillas por $5.000 ARS, en un pago único con Mercado Pago. Se acreditan al confirmarse el pago; los reintegros y contracargos ajustan el saldo de semillas correspondiente.</li>
        <li>
          El uso de tus datos se rige por la{" "}
          <a className="text-primary underline" href="/privacidad">
            política de privacidad
          </a>
          .
        </li>
      </ul>
      <section className="space-y-3 rounded-3xl border border-app bg-surface p-5">
        <h2 className="text-lg font-semibold">Propiedad intelectual y uso permitido</h2>
        <p>Se permite utilizar las funciones de la app y realizar las copias técnicas necesarias para su funcionamiento en el navegador o como PWA. Esto no concede una licencia general para redistribuir los aportes protegidos del proyecto, comercializarlos, ofrecer una réplica del servicio con ellos o atribuirse su autoría.</p>
        <p>Los derechos reservados por {PROJECT_HOLDER} se limitan a sus aportes originales protegibles y sobre los que tenga derechos suficientes. Las dependencias, fuentes, iconos, emojis y demás recursos ajenos conservan sus licencias y titulares. No se reservan ideas, funcionalidades generales ni elementos no protegibles.</p>
        <p>Los permisos legales, las licencias aplicables y las autorizaciones válidas previamente otorgadas se respetan. La mera publicación de un repositorio no lo convierte en código abierto; se respetan los permisos que resulten de los términos de la plataforma de alojamiento.</p>
        <Link href="/propiedad-intelectual" className="inline-flex min-h-11 items-center font-semibold text-primary underline">Ver propiedad intelectual, permisos y créditos</Link>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Contenidos y colaboraciones</h2>
        <p>Los mensajes, fotografías y avatares de las personas usuarias no pasan a ser propiedad del proyecto. Sólo se requieren los permisos necesarios para tratarlos y mostrarlos conforme a las funciones elegidas, la configuración de privacidad y la política de privacidad. Debés contar con los derechos necesarios sobre lo que compartís y respetar los de otras personas.</p>
        <p>Enviar una sugerencia o propuesta no transfiere automáticamente derechos sobre una obra. Las colaboraciones que incorporen código, diseños u otros materiales deben acordar su alcance y permisos por escrito antes de integrarse.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cambios y derechos legales</h2>
        <p>Las actualizaciones de estas condiciones se publicarán con su fecha. No se aplicarán retroactivamente para quitar derechos adquiridos. Cuando una modificación requiera aceptación expresa, deberá solicitarse por el medio correspondiente; la publicación de este texto no acredita por sí sola esa aceptación.</p>
        <p>Estas condiciones se interpretan conforme a la legislación argentina aplicable, sin limitar derechos irrenunciables de consumidores ni imponer una jurisdicción que los desconozca. Para consultas y solicitudes de permiso, utilizá el contacto indicado arriba.</p>
      </section>
      <p className="text-xs text-muted">© 2026 {PROJECT_HOLDER}. Derechos reservados sobre los aportes propios protegibles; se respetan las licencias de terceros y las excepciones legales.</p>
    </main>
  );
}

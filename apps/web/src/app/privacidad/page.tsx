import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 text-sm leading-relaxed text-slate-700">
      <h1 className="text-2xl font-bold text-slate-900">Política de privacidad</h1>
      <p>
        Sala de Estudio UNS es un proyecto independiente de estudiantes para compartir en tiempo real la
        disponibilidad de lugares en la sala de estudio. No es un servicio oficial de la Universidad Nacional del
        Sur.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">Qué datos guardamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Cuenta: nombre y email. Si entrás con Google, recibimos sólo tu nombre, email y foto de perfil.</li>
        <li>Perfil: los campos que vos completes (apodo, carrera, materia, bio, Instagram, legajo). Todos son opcionales y privados por defecto.</li>
        <li>Actividad en la sala: check-ins (&quot;Estoy acá&quot;), observaciones de lugares, mensajes de chat y reportes.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">Ubicación</h2>
      <p>
        Usamos tu ubicación sólo en el momento de marcar un lugar, para comprobar que estás cerca de la sala. No
        guardamos tus coordenadas exactas ni las mostramos a otras personas: sólo conservamos la precisión del GPS y si
        estabas dentro del área.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">Quién ve tus datos</h2>
      <p>
        Otras personas registradas sólo ven lo que vos elijas mostrar en tu perfil. La evidencia de reportes es privada
        y sólo la ve el equipo de moderación. No vendemos ni compartimos tus datos con terceros.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">Conservación y borrado</h2>
      <p>
        Podés eliminar tu cuenta desde tu perfil en cualquier momento; eso borra tu perfil, check-ins y mensajes. Los
        eventos de seguridad se conservan hasta 180 días y la evidencia de reportes hasta 180 días después de
        resuelto el reporte.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">Contacto</h2>
      <p>
        Por consultas sobre tus datos escribí a{" "}
        <a className="text-primary underline" href="mailto:ilan.daniele@gmail.com">
          ilan.daniele@gmail.com
        </a>
        .
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { BackButton } from "@/components/BackButton";
import { GUIDES, getGuide } from "@/features/guides/guides";
import { GUIDE_RESOURCES, GUIDE_RESOURCES_CHECKED, ROOM_GUIDE_RESOURCES_CHECKED } from "@/features/guides/guide-resources";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guias/${guide.slug}` },
    openGraph: { type: "article", title: guide.title, description: guide.description, url: `/guias/${guide.slug}`, modifiedTime: guide.updated },
  };
}

// Explicit props type (instead of the generated global `PageProps`) so `tsc` passes in CI before
// `next build`/`next typegen` has generated `.next/types`.
export default async function GuidePage(props: Props) {
  const { slug } = await props.params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const resourcesChecked = guide.slug === "visitar-la-sala-de-estudio-uns" ? ROOM_GUIDE_RESOURCES_CHECKED : GUIDE_RESOURCES_CHECKED;
  const others = GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-[15px] leading-relaxed text-main">
      <BackButton fallbackHref="/guias" />
      <article className="space-y-4">
        <header className="space-y-2">
          <p className="label-caps text-faint">
            <Link href="/guias" className="hover:underline">
              Guías de estudio
            </Link>
          </p>
          <h1 className="t-heading">{guide.title}</h1>
          <p className="text-muted">{guide.description}</p>
          <p className="text-sm text-muted">Responsable: <Link href="/proyecto#contenido" className="text-primary underline underline-offset-4">Ilan Daniele · Criterio editorial y uso de IA</Link></p>
          <p className="font-mono text-xs text-faint">
            {guide.readingMinutes} min de lectura · actualizado <time dateTime={guide.updated}>{formatDate(guide.updated)}</time>
          </p>
        </header>

        <nav aria-label="Contenido de la guía" className="rounded-2xl border border-app bg-surface p-4">
          <h2 className="font-semibold">En esta guía</h2>
          <ol className="mt-2 list-decimal pl-5 text-sm">
            {guide.sections.map((section, index) => <li key={section.heading}><a href={`#seccion-${index + 1}`} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{section.heading}</a></li>)}
          </ol>
        </nav>

        {guide.sections.map((section, index) => (
          <section id={`seccion-${index + 1}`} key={section.heading} className="scroll-mt-36 space-y-3">
            <h2 className="pt-2 text-lg font-semibold text-main">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
            {section.list ? (
              <ul className="list-disc space-y-1 pl-5">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>

      {/* A single labelled unit only after the complete article, away from reading controls. */}
      <AdSlot placement="article" />

      <section aria-labelledby="guide-resources" className="space-y-3 rounded-2xl border border-app bg-surface p-5">
        <h2 id="guide-resources" className="text-lg font-semibold">Lecturas complementarias</h2>
        <p className="text-sm text-muted">Recursos para profundizar y contrastar las ideas de esta guía. Algunas lecturas están en inglés.</p>
        <ul className="space-y-2">
          {(GUIDE_RESOURCES[guide.slug] ?? []).map((resource) => <li key={resource.url}><a href={resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-words text-sm font-semibold text-primary underline underline-offset-4">{resource.title}</a></li>)}
        </ul>
        <p className="text-xs text-muted">Enlaces consultados el <time dateTime={resourcesChecked}>{formatDate(resourcesChecked)}</time>. No implican un aval de esas instituciones a Sala de Estudio.</p>
      </section>

      <p className="text-sm text-muted">¿Encontraste un error en esta guía? <Link href="/sugerencias" className="font-semibold text-primary underline underline-offset-4">Enviá una corrección</Link> o escribí a <a href="mailto:ilan.daniele@gmail.com" className="break-all text-primary underline underline-offset-4">ilan.daniele@gmail.com</a>. Podés hacerlo sin iniciar sesión.</p>

      <nav aria-label="Otras guías" className="space-y-2 border-t border-app pt-4">
        <h2 className="text-base font-semibold text-main">Seguí leyendo</h2>
        <ul className="space-y-1">
          {others.map((g) => (
            <li key={g.slug}>
              <Link href={`/guias/${g.slug}`} className="text-primary underline underline-offset-2">
                {g.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

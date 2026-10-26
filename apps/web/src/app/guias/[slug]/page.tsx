import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { BackButton } from "@/components/BackButton";
import { GUIDES, getGuide } from "@/features/guides/guides";
import { GUIDE_RESOURCES, GUIDE_RESOURCES_CHECKED } from "@/features/guides/guide-resources";

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
    openGraph: { type: "article", title: guide.title, description: guide.description },
  };
}

// Explicit props type (instead of the generated global `PageProps`) so `tsc` passes in CI before
// `next build`/`next typegen` has generated `.next/types`.
export default async function GuidePage(props: Props) {
  const { slug } = await props.params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  // One ad unit after the first third of the article, never before the reader has content.
  const adAfter = Math.max(0, Math.floor(guide.sections.length / 3) - 1);
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
          <p className="text-sm text-muted">Una guía de Sala de Estudio · <Link href="/proyecto#contenido" className="text-primary underline underline-offset-4">Sobre este material</Link></p>
          <p className="font-mono text-xs text-faint">
            {guide.readingMinutes} min de lectura · actualizado <time dateTime={guide.updated}>{formatDate(guide.updated)}</time>
          </p>
        </header>

        {guide.sections.map((section, index) => (
          <section key={section.heading} className="space-y-3">
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
            {index === adAfter ? <AdSlot placement="article" /> : null}
          </section>
        ))}
      </article>

      <section aria-labelledby="guide-resources" className="space-y-3 rounded-2xl border border-app bg-surface p-5">
        <h2 id="guide-resources" className="text-lg font-semibold">Lecturas complementarias</h2>
        <p className="text-sm text-muted">Recursos para profundizar y contrastar las ideas de esta guía. Algunas lecturas están en inglés.</p>
        <ul className="space-y-2">
          {(GUIDE_RESOURCES[guide.slug] ?? []).map((resource) => <li key={resource.url}><a href={resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-words text-sm font-semibold text-primary underline underline-offset-4">{resource.title}</a></li>)}
        </ul>
        <p className="text-xs text-muted">Enlaces consultados el <time dateTime={GUIDE_RESOURCES_CHECKED}>{formatDate(GUIDE_RESOURCES_CHECKED)}</time>. No implican un aval de esas instituciones a Sala de Estudio.</p>
      </section>

      <p className="text-sm text-muted">¿Encontraste un error en esta guía? <Link href="/sugerencias" className="font-semibold text-primary underline underline-offset-4">Enviá una corrección</Link>.</p>

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

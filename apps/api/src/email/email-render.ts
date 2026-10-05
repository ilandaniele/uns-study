const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Escapes first, then links URLs; trailing sentence punctuation stays outside the anchor. */
function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (match) => {
    const trailing = /[.,;:!?)]+$/.exec(match)?.[0] ?? "";
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `<a href="${url}">${url}</a>${trailing}`;
  });
}

const FOOTER = "Recibís este mail porque tenés una cuenta en Sala de Estudio. Para no recibir más novedades:";

/** Renders the admin-authored plain text to a text + minimal HTML pair, both ending in the unsubscribe footer. */
export function renderEmail(bodyText: string, unsubscribePageUrl: string): { text: string; html: string } {
  const text = `${bodyText}\n\n--\n${FOOTER} ${unsubscribePageUrl}`;
  const body = linkify(escapeHtml(bodyText)).replace(/\r?\n/g, "<br>");
  const footer = `${escapeHtml(FOOTER)} <a href="${escapeHtml(unsubscribePageUrl)}">${escapeHtml(unsubscribePageUrl)}</a>`;
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">${body}` +
    `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">` +
    `<p style="font-size:12px;color:#666">${footer}</p></div>`;
  return { text, html };
}

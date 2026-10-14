import { describe, expect, it } from "vitest";
import { renderEmail } from "./email-render.js";

const UNSUB = "https://web.test/baja?u=1&t=abc";

describe("renderEmail", () => {
  it("escapes html in the body", () => {
    const { html } = renderEmail(`<script>alert("x")</script> & 'y'`, UNSUB);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });

  it("linkifies urls and keeps trailing punctuation outside the anchor", () => {
    const { html } = renderEmail("Mirá https://saladeestudio.com.ar.", UNSUB);
    expect(html).toContain('<a href="https://saladeestudio.com.ar">https://saladeestudio.com.ar</a>.');
  });

  it("converts newlines to <br>", () => {
    const { html } = renderEmail("uno\ndos\r\ntres", UNSUB);
    expect(html).toContain("uno<br>dos<br>tres");
  });

  it("adds the unsubscribe footer to both parts", () => {
    const { text, html } = renderEmail("Hola", UNSUB);
    expect(text).toContain(`Recibís este mail porque tenés una cuenta en Sala de Estudio. Para no recibir más novedades: ${UNSUB}`);
    expect(html).toContain('href="https://web.test/baja?u=1&amp;t=abc"');
  });
});

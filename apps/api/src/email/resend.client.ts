export interface ResendMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

/** Thrown on any non-2xx Resend response; the send job retries 429/5xx and fails the rest. */
export class ResendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

export const RESEND_BATCH_MAX = 100;

export class ResendClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Sends up to 100 messages in one call; returns the provider message ids in input order. */
  async sendBatch(msgs: ResendMessage[]): Promise<string[]> {
    if (msgs.length === 0) return [];
    if (msgs.length > RESEND_BATCH_MAX) throw new Error(`Resend batch is limited to ${RESEND_BATCH_MAX} messages.`);
    const res = await this.fetchImpl("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(msgs),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new ResendError(res.status, `Resend responded ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    const json = (await res.json()) as { data?: { id: string }[] };
    return (json.data ?? []).map((d) => d.id);
  }
}

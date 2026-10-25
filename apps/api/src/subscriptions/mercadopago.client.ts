import { randomUUID } from "node:crypto";

export type MpPreapproval = {
  id: string;
  status: string;
  external_reference: string | null;
  init_point?: string;
  next_payment_date?: string | null;
  auto_recurring?: { transaction_amount?: number; currency_id?: string; frequency?: number; frequency_type?: string };
};

/** A non-2xx Mercado Pago response; callers branch on `status` (e.g. 404 on cancel). */
export class MpHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MpHttpError";
  }
}

export interface MpPreapprovalBody {
  reason: string;
  external_reference: string;
  payer_email: string;
  auto_recurring: { frequency: number; frequency_type: "months"; transaction_amount: number; currency_id: "ARS" };
  back_url: string;
  status: "pending";
}

export interface MpPreferenceBody {
  items: Array<{ title: string; quantity: 1; unit_price: number; currency_id: "ARS" }>;
  back_urls: { success: string; failure: string; pending: string };
  auto_return: "approved";
  statement_descriptor: string;
  external_reference?: string;
  notification_url?: string;
}

export interface MpPayment {
  id: string | number;
  status: string;
  external_reference: string | null;
  currency_id: string;
  transaction_amount: number;
  transaction_amount_refunded?: number;
  date_last_updated?: string;
}

export type MpPreference = { id: string; init_point: string };

const BASE_URL = "https://api.mercadopago.com";
const TIMEOUT_MS = 10_000;

/** Minimal Mercado Pago REST client (Preapproval API): `fetch` only, no SDK. */
export class MercadoPagoClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  createPreapproval(body: MpPreapprovalBody): Promise<MpPreapproval> {
    return this.request<MpPreapproval>("POST", "/preapproval", body, { "X-Idempotency-Key": randomUUID() });
  }

  /** Checkout Pro preference for a one-time payment (donations). */
  createPreference(body: MpPreferenceBody): Promise<MpPreference> {
    return this.request<MpPreference>("POST", "/checkout/preferences", body, { "X-Idempotency-Key": randomUUID() });
  }

  getPreapproval(id: string): Promise<MpPreapproval> {
    return this.request<MpPreapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);
  }

  getPayment(id: string): Promise<MpPayment> {
    return this.request<MpPayment>("GET", `/v1/payments/${encodeURIComponent(id)}`);
  }

  getAuthorizedPayment(id: string): Promise<{ preapproval_id: string }> {
    return this.request<{ preapproval_id: string }>("GET", `/authorized_payments/${encodeURIComponent(id)}`);
  }

  cancelPreapproval(id: string): Promise<MpPreapproval> {
    return this.request<MpPreapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, { status: "cancelled" });
  }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const res = await this.fetchImpl(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    if (!res.ok) throw new MpHttpError(`Mercado Pago ${method} ${path} failed (${res.status})`, res.status);
    return (await res.json()) as T;
  }
}

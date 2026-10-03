"use client";

import type { EmailCampaignDto, EmailCampaignStatus } from "@sala/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmSendDialog } from "./ConfirmSendDialog";
import { EMAIL_TEMPLATES } from "./templates";
import { createEmailCampaign, fetchEmailCampaigns, fetchEmailConfig, fetchRecipientCount, sendEmailCampaign, updateEmailCampaign } from "./api";

const STATUS_LABEL: Record<EmailCampaignStatus, string> = { draft: "Borrador", sending: "Enviando", sent: "Enviada" };

/** Admin composer for email campaigns. Nothing is delivered until a draft is explicitly confirmed in the dialog. */
export function EmailCampaignComposer() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [campaigns, setCampaigns] = useState<EmailCampaignDto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ campaign: EmailCampaignDto; recipientCount: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCampaigns(await fetchEmailCampaigns());
    } catch {
      setError("No pudimos cargar las campañas.");
    }
  }, []);

  useEffect(() => {
    void fetchEmailConfig()
      .then((config) => setEnabled(config.enabled))
      .catch(() => setEnabled(false));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void load();
  }, [load]);

  // Poll while a campaign is being delivered so the counts move.
  const anySending = campaigns.some((c) => c.status === "sending");
  useEffect(() => {
    if (!anySending) return;
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [anySending, load]);

  function applyTemplate(id: string) {
    const template = EMAIL_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    setSubject(template.subject);
    setBodyText(template.bodyText);
  }

  function resetForm() {
    setEditingId(null);
    setSubject("");
    setBodyText("");
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !bodyText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) await updateEmailCampaign(editingId, { subject, bodyText });
      else await createEmailCampaign({ subject, bodyText });
      resetForm();
      await load();
    } catch {
      setError("No pudimos guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  async function askToSend(campaign: EmailCampaignDto) {
    setError(null);
    setSendError(null);
    try {
      const { recipientCount } = await fetchRecipientCount();
      setConfirm({ campaign, recipientCount });
    } catch {
      setError("No pudimos calcular a cuántas personas se enviaría.");
    }
  }

  async function confirmSend() {
    if (!confirm) return;
    setSending(true);
    setSendError(null);
    try {
      await sendEmailCampaign(confirm.campaign.id);
      setConfirm(null);
      await load();
    } catch {
      setSendError("No pudimos enviar el mail. Revisá la configuración e intentá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (enabled === false) {
    return (
      <p className="rounded-[14px] border border-app bg-surface p-4 text-sm text-muted">
        El envío de mails no está configurado todavía. Cuando se cargue la clave de Resend y el remitente, vas a poder armar y enviar campañas desde acá.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => void saveDraft(e)} className="flex flex-col gap-3 rounded-[14px] border border-app bg-surface p-4">
        <p className="text-sm font-semibold text-main">{editingId ? "Editar borrador" : "Nueva campaña"}</p>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Plantilla
          <select
            value=""
            onChange={(e) => applyTemplate(e.target.value)}
            className="min-h-11 rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          >
            <option value="">Elegí una plantilla…</option>
            {EMAIL_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Asunto
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            className="min-h-11 rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Mensaje
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            maxLength={10_000}
            rows={10}
            className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
        </label>
        <p className="text-xs text-muted">Al final de cada mail agregamos solos el aviso y el enlace para dejar de recibir novedades.</p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !subject.trim() || !bodyText.trim()}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar borrador
          </button>
          {editingId ? (
            <button type="button" onClick={resetForm} className="min-h-11 rounded-lg border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)]">
              Cancelar edición
            </button>
          ) : null}
        </div>
      </form>

      {error ? <p className="text-sm text-[var(--seat-occupied)]">{error}</p> : null}

      <div className="flex flex-col divide-y divide-[var(--border)] rounded-[14px] border border-app bg-surface">
        {campaigns.map((c) => (
          <div key={c.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-main">{c.subject}</span>
              <span className="inline-flex w-fit items-center rounded-md border border-app px-2.5 py-0.5 text-xs font-semibold text-muted">{STATUS_LABEL[c.status]}</span>
            </div>
            {c.status === "draft" ? (
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(c.id);
                    setSubject(c.subject);
                    setBodyText(c.bodyText);
                    window.scrollTo({ top: 0 });
                  }}
                  className="min-h-11 rounded-md border border-app px-3 text-xs font-medium text-muted hover:bg-[var(--surface-2)] hover:text-main"
                >
                  Editar
                </button>
                <button type="button" onClick={() => void askToSend(c)} className="min-h-11 rounded-md bg-primary px-3 text-xs font-semibold text-white">
                  Enviar
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">
                Destinatarios: {c.recipientCount ?? 0} · enviados {c.sentCount} · fallidos {c.failedCount} · pendientes {c.pendingCount}
              </p>
            )}
          </div>
        ))}
        {campaigns.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">Todavía no hay campañas. Armá la primera arriba.</p> : null}
      </div>

      {confirm ? (
        <ConfirmSendDialog
          recipientCount={confirm.recipientCount}
          pending={sending}
          error={sendError}
          onConfirm={() => void confirmSend()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

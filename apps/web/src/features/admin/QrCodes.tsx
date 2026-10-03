"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import type { TableType } from "@sala/contracts";
import { apiDelete, apiFetch, apiPost } from "@/lib/api";
import { tableDisplayName } from "@/features/room/format";
import type { RoomQrCodeDto } from "./types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** "M04" -> "Mesa 4", "B01" -> "Barra entrada izquierda", for the printed card's big label. */
function friendlyTableName(tableCode: string): string {
  const type: TableType = tableCode.startsWith("B") ? "WALL_BAR" : "MAIN_TABLE";
  return tableDisplayName({ code: tableCode, type }, tableCode);
}

export function QrCodes({ roomSlug }: { roomSlug: string }) {
  const [items, setItems] = useState<RoomQrCodeDto[]>([]);
  const [tableCode, setTableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [svgs, setSvgs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const dtos = await apiFetch<RoomQrCodeDto[]>(`/api/v1/admin/rooms/${roomSlug}/qr`);
      setItems(dtos);
    } catch {
      setError("No pudimos cargar los códigos QR.");
    }
  }, [roomSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function renderAll() {
      const entries = await Promise.all(
        items.map(async (item) => {
          const url = `${APP_URL}/q/${item.token}`;
          const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 200 });
          return [item.id, svg] as const;
        }),
      );
      if (!cancelled) setSvgs(Object.fromEntries(entries));
    }
    void renderAll();
    return () => {
      cancelled = true;
    };
  }, [items]);

  async function create() {
    try {
      await apiPost(`/api/v1/admin/rooms/${roomSlug}/qr`, tableCode.trim() ? { tableCode: tableCode.trim() } : {});
      setTableCode("");
      await load();
    } catch {
      setError("No pudimos generar el código. Revisá que la mesa exista.");
    }
  }

  async function deactivate(id: string) {
    await apiDelete(`/api/v1/admin/rooms/${roomSlug}/qr/${id}`);
    await load();
  }

  return (
    <div className="qr-print-page flex flex-col gap-4">
      <div className="qr-print-hide flex gap-2 rounded-[14px] border border-app bg-surface p-4">
        <input
          value={tableCode}
          onChange={(e) => setTableCode(e.target.value)}
          placeholder="Código de mesa (opcional, ej. M01)"
          className="flex-1 rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
        />
        <button type="button" onClick={() => void create()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
          Generar QR
        </button>
      </div>

      {error ? <p className="qr-print-hide text-sm text-[var(--seat-occupied)]">{error}</p> : null}

      {items.length === 0 ? (
        <p className="qr-print-hide rounded-[14px] border border-app bg-surface px-4 py-6 text-center text-sm text-muted">
          Todavía no hay códigos QR generados. Generá el primero arriba.
        </p>
      ) : (
        <div className="qr-print-grid grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="qr-print-card flex min-w-0 flex-col items-center gap-2 rounded-[14px] border border-app bg-surface p-4"
            >
              {svgs[item.id] ? (
                // Trusted output of the `qrcode` library, not user input.
                <div className="w-full max-w-[200px] overflow-hidden rounded-md bg-white [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs[item.id]! }} />
              ) : (
                <div className="aspect-square w-full max-w-[200px] rounded-md animate-pulse bg-[var(--surface-2)]" />
              )}
              <p className="text-lg font-semibold text-main">{item.tableCode ? friendlyTableName(item.tableCode) : "Sala completa"}</p>
              {item.tableCode ? <p className="font-mono text-[11px] text-muted">{item.tableCode}</p> : null}
              <p className="w-full break-all text-center font-mono text-[11px] text-muted">{`${APP_URL}/q/${item.token}`}</p>
              <p
                className="qr-print-hide text-xs font-semibold"
                style={{ color: item.active ? "var(--seat-free)" : "var(--text-faint)" }}
              >
                {item.active ? "Activo" : "Desactivado"}
              </p>
              <p className="qr-print-hide text-center text-xs text-muted">
                {item.scanCount} {item.scanCount === 1 ? "escaneo" : "escaneos"}
                {item.lastScannedAt ? ` · último ${new Date(item.lastScannedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}` : ""}
              </p>
              {item.active ? (
                <button
                  type="button"
                  onClick={() => void deactivate(item.id)}
                  className="qr-print-hide rounded-md border border-app px-3 py-1 text-xs font-medium text-[var(--seat-occupied)] hover:bg-[var(--surface-2)]"
                >
                  Desactivar
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiFetch, apiPost } from "@/lib/api";
import type { RoomQrCodeDto } from "./types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          value={tableCode}
          onChange={(e) => setTableCode(e.target.value)}
          placeholder="Código de mesa (opcional, ej. M01)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="button" onClick={() => void create()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
          Generar QR
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 print:break-inside-avoid">
            {svgs[item.id] ? (
              // Trusted output of the `qrcode` library, not user input.
              <div dangerouslySetInnerHTML={{ __html: svgs[item.id]! }} />
            ) : (
              <div className="h-[200px] w-[200px] animate-pulse bg-slate-100" />
            )}
            <p className="text-sm font-semibold text-slate-800">{item.tableCode ?? "Sala completa"}</p>
            <p className={item.active ? "text-xs font-semibold text-green-600" : "text-xs text-slate-400"}>
              {item.active ? "Activo" : "Desactivado"}
            </p>
            {item.active ? (
              <button
                type="button"
                onClick={() => void deactivate(item.id)}
                className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 print:hidden"
              >
                Desactivar
              </button>
            ) : null}
          </div>
        ))}
        {items.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay códigos QR generados.</p> : null}
      </div>
    </div>
  );
}

"use client";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { CircleIcon, SquaresFourIcon } from "@phosphor-icons/react/dist/ssr";
import { useMe } from "@/lib/me-store";
import { useQrContext } from "@/lib/qr-context";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { useRoomMode } from "./useRoomMode";

const CommonRoom = dynamic(() => import("@/app/sala/[slug]/RoomPageClient").then(m => m.RoomPageClient), { loading: () => <RoomSkeleton /> });
const SimpleRoom = dynamic(() => import("./SimpleRoomPage").then(m => m.SimpleRoomPage), { loading: () => <RoomSkeleton /> });

function AuthenticatedRoom({ slug, about, userId }: { slug: string; about: ReactNode; userId: string }) {
  const preference = useRoomMode(userId);
  const qr = useQrContext();
  const [qrMode, setQrMode] = useState(() => Boolean(qr.qrToken && qr.seatCode));
  const mode = qrMode ? "SIMPLE" : preference.mode;
  const [acting, setActing] = useState(false);
  const ready = !preference.loading;
  return <>
    <div className="mx-auto flex max-w-7xl flex-col items-end gap-2 px-4 pt-3">
      <div role="group" aria-label="Modo de la sala" className="inline-flex gap-1 rounded-full border border-app bg-surface p-1">
        {(["COMMON", "SIMPLE"] as const).map(option => <button key={option} type="button" aria-pressed={ready && mode === option}
          disabled={!ready || preference.saving || acting} onClick={() => { setQrMode(false); if (option !== preference.mode) void preference.change(option); }}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${ready && mode === option ? "bg-primary text-white" : "text-muted hover:bg-surface-2"}`}>
          {option === "COMMON" ? <SquaresFourIcon aria-hidden="true" size={17}/> : <CircleIcon aria-hidden="true" size={17} weight="fill"/>}{option === "COMMON" ? "Común" : "Simple"}
        </button>)}
      </div>
      {preference.error ? <p role="alert" className="max-w-md text-sm text-muted">{preference.error}</p> : null}
    </div>
    {!ready ? <RoomSkeleton /> : mode === "SIMPLE" ? <SimpleRoom slug={slug} onPendingChange={setActing}/> : <CommonRoom slug={slug}/>}
    {(!ready || mode === "COMMON") ? about : null}
  </>;
}

export function RoomExperience({ slug, about }: { slug: string; about: ReactNode }) {
  const { me, loading } = useMe();
  if (loading) return <><RoomSkeleton />{about}</>;
  // Account changes remount the preference controller, including pending reads/writes and errors.
  if (me?.user) return <AuthenticatedRoom key={me.user.id} userId={me.user.id} slug={slug} about={about}/>;
  return <><CommonRoom slug={slug}/>{about}</>;
}

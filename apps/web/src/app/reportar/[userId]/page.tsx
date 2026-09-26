"use client";

import type { ReportContext } from "@uns/contracts";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ReportForm } from "@/features/reports/ReportForm";
import { useSession } from "@/lib/auth-client";

const VALID_CONTEXTS: ReportContext[] = ["PROFILE", "CHAT", "DM"];

export default function ReportUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  const rawContext = searchParams.get("context");
  const context: ReportContext = VALID_CONTEXTS.includes(rawContext as ReportContext) ? (rawContext as ReportContext) : "PROFILE";
  const contextMessageId = searchParams.get("messageId") ?? undefined;
  const roomId = searchParams.get("roomId") ?? undefined;

  if (isPending) {
    return <main className="p-6 text-center text-slate-500">Cargando…</main>;
  }

  if (!session?.user) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <p className="text-slate-600">Iniciá sesión para reportar a un usuario.</p>
        <Link href="/login" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
          Iniciar sesión
        </Link>
      </main>
    );
  }

  if (session.user.id === userId) {
    return <main className="p-6 text-center text-slate-500">No podés reportarte a vos mismo.</main>;
  }

  return (
    <main className="mx-auto max-w-lg p-4">
      <ReportForm reportedUserId={userId} context={context} contextMessageId={contextMessageId} roomId={roomId} />
    </main>
  );
}

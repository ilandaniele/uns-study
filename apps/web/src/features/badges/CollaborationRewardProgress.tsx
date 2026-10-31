import { COLLABORATION_REWARD_COOLDOWN_DAYS, type CollaborationProgressDto } from "@sala/contracts";
import { CrownIcon } from "@phosphor-icons/react/dist/ssr";

export function CollaborationRewardProgress({ collaboration }: { collaboration: CollaborationProgressDto }) {
  const reward = collaboration.weeklyReward;
  if (!reward) return null;
  const places = Math.min(collaboration.todayPlaces, reward.targetPlaces);
  return <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
    <p className="flex items-center gap-2 text-sm font-semibold"><CrownIcon className="shrink-0 text-primary" size={20} aria-hidden="true" />Una semana Pro por tu ayuda</p>
    {!reward.emailVerified ? <p className="mt-2 text-sm text-muted">Verificá tu email para recibir premios por colaborar.</p> : reward.nextEligibleAt ? <p className="mt-2 text-sm leading-relaxed text-muted">Ya ganaste tu premio. Podés volver a ganarlo desde el {new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(reward.nextEligibleAt))}.</p> : <>
      <p className="mt-2 text-sm leading-relaxed text-muted">Actualizá {reward.targetPlaces} lugares distintos en un día y ganá {reward.proDays} días Pro + {reward.seeds} semillas.</p>
      <progress aria-label="Lugares actualizados hoy para el premio Pro" value={places} max={reward.targetPlaces} className="mt-3 h-2 w-full overflow-hidden rounded-full accent-primary" />
      <p className="mt-1 text-xs text-muted">{places}/{reward.targetPlaces} lugares hoy · Un premio cada {COLLABORATION_REWARD_COOLDOWN_DAYS} días.</p>
    </>}
  </div>;
}

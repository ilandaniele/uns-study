import type { ComponentType } from "react";
import { BellIcon, CheckCircleIcon, HandPalmIcon, MapPinIcon, MapTrifoldIcon, SignOutIcon } from "@phosphor-icons/react/dist/ssr";
import type { IconProps } from "@phosphor-icons/react";

export interface HowToStep {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

/** Shared by the in-room "Cómo usar la app" modal and the /como-usar page. */
export const HOW_TO_STEPS: HowToStep[] = [
  {
    icon: MapTrifoldIcon,
    title: "Mirá el mapa",
    body: "Verde es libre, rojo es ocupado, amarillo es guardado y gris es sin datos. Tocá cualquier lugar para ver más.",
  },
  {
    icon: MapPinIcon,
    title: "Tocá «Estoy acá»",
    body: "Cuando te sientes, tocá tu lugar y marcalo. Tenés que estar en la sala: el GPS lo verifica. Dura hasta 3 horas y 10 minutos antes te avisamos para que toques «Sigo acá».",
  },
  {
    icon: CheckCircleIcon,
    title: "Ayudá a los demás",
    body: "Si ves un lugar que no es tuyo, tocalo y marcá «Está libre», «Está ocupado» o «Está guardado».",
  },
  {
    icon: HandPalmIcon,
    title: "¿Lugar guardado sin nadie?",
    body: "Si alguien guarda un lugar y no está, podés votar para que lo liberen. La gente de la sala decide.",
  },
  {
    icon: SignOutIcon,
    title: "Al irte, tocá «Me voy»",
    body: "Así tu lugar queda libre para otra persona.",
  },
  {
    icon: BellIcon,
    title: "Activá las notificaciones",
    body: "En tu Perfil, prendé «Avisame cuando se libere un lugar» y te avisamos al instante.",
  },
];

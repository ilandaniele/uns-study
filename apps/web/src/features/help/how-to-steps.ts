import type { ComponentType } from "react";
import {
  BellIcon,
  CheckCircleIcon,
  FlagIcon,
  HandPalmIcon,
  MapPinIcon,
  MapTrifoldIcon,
  SignOutIcon,
} from "@phosphor-icons/react/dist/ssr";
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
    body: "Cuando te sientes, tocá tu lugar y marcalo. Tenés que estar en la sala: el GPS lo verifica. Dura 3 horas y 5 minutos antes te avisamos para que toques «Sigo acá» y renueves otras 3 horas. Con Pro elegís hasta qué hora te quedás.",
  },
  {
    icon: CheckCircleIcon,
    title: "Ayudá a los demás",
    body: "Si ves un lugar que no es tuyo, tocalo y marcá «Está libre», «Está ocupado» o «Está guardado». Un reporte de «Está ocupado» dura 2 horas y podés actualizarlo si cambia la situación. «Está guardado» es cuando hay cosas (mochila, apuntes, campera) pero no hay nadie sentado.",
  },
  {
    icon: FlagIcon,
    title: "Denunciá un lugar guardado",
    body: "¿Alguien dejó sus cosas y se fue? Tocá el lugar y marcá «Está guardado». Después elegí «Pedir que lo liberen» para abrir una votación, o «Reportar a…» si la persona aparece con su nombre. Si el lugar figura ocupado pero hace rato que no hay nadie, tocá «Se fue hace más de 30 min».",
  },
  {
    icon: HandPalmIcon,
    title: "Votaciones",
    body: "Pedir que liberen un lugar abre una votación de 5 minutos. Si tenés tu lugar marcado, podés votar «Está ocupado», «Está libre» o «Está guardado». El resultado confirma si la persona sigue ahí y si quedaron pertenencias. Una foto reciente o la respuesta «Sigo acá» requieren más confirmaciones para retirar al titular. Podés abrir hasta 3 por hora.",
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

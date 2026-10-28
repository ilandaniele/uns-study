"use client";
import Link from "next/link";
import type { PersonSearchDto } from "@sala/contracts";
import { Avatar } from "@/components/Avatar";
import { FriendAction } from "./FriendAction";

export function PersonCard({ person }: { person: PersonSearchDto }) {
  return <article aria-label={person.displayName} className="flex flex-wrap items-center gap-4 rounded-2xl border border-app bg-surface p-4 sm:flex-nowrap">
    <Avatar userId={person.target.kind === "user" ? person.target.userId : person.target.alias} name={person.displayName} url={person.avatarUrl} aliasAnimal={person.aliasAnimal ?? undefined} size={44}/>
    <div className="min-w-0 flex-1">{person.profileHref ? <Link href={person.profileHref} className="block break-words font-semibold text-main hover:text-primary">{person.displayName}</Link> : <p className="break-words font-semibold">{person.displayName}</p>}{person.career ? <p className="mt-1 text-xs text-muted">{person.career}</p> : null}{person.target.kind === "alias" ? <p className="mt-1 text-xs text-muted">Participa con un alias</p> : null}</div>
    <div className="w-full sm:w-auto"><FriendAction target={person.target} name={person.displayName} initial={person.friendship}/></div>
  </article>;
}

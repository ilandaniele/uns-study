"use client";
import { useParams } from "next/navigation";
import { AliasProfileView } from "@/features/profile/AliasProfileView";
import { aliasFromParam } from "@/features/profile/alias-param";

export default function AliasPage() {
  const { alias: param } = useParams<{ alias: string }>();
  const alias = aliasFromParam(param);
  return <AliasProfileView key={alias} alias={alias}/>;
}

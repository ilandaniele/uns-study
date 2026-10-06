"use client";

import { useParams } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { UserDetail } from "@/features/admin/UserDetail";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <BackButton fallbackHref="/admin/users" label="Volver a usuarios" />
      <UserDetail userId={params.id} />
    </>
  );
}

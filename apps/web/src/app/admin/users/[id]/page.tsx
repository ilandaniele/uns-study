"use client";

import { useParams } from "next/navigation";
import { UserDetail } from "@/features/admin/UserDetail";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  return <UserDetail userId={params.id} />;
}

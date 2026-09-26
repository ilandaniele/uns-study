"use client";

import { useParams } from "next/navigation";
import { ReportDetail } from "@/features/admin/ReportDetail";

export default function AdminReportDetailPage() {
  const params = useParams<{ id: string }>();
  return <ReportDetail reportId={params.id} />;
}

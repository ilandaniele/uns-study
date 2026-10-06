"use client";

import { useParams } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { ReportDetail } from "@/features/admin/ReportDetail";

export default function AdminReportDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <BackButton fallbackHref="/admin/reports" label="Volver a reportes" />
      <ReportDetail reportId={params.id} />
    </>
  );
}

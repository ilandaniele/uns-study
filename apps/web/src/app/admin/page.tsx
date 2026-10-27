import { LiveRoomPanel } from "@/features/admin/LiveRoomPanel";
import { StatsPanel } from "@/features/admin/StatsPanel";
import { SectionUsagePanel } from "@/features/admin/SectionUsagePanel";

export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <StatsPanel roomSlug="principal" />
      <SectionUsagePanel />
      <LiveRoomPanel roomSlug="principal" />
    </div>
  );
}

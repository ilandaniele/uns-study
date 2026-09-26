import { LiveRoomPanel } from "@/features/admin/LiveRoomPanel";
import { StatsPanel } from "@/features/admin/StatsPanel";

export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <StatsPanel roomSlug="principal" />
      <LiveRoomPanel roomSlug="principal" />
    </div>
  );
}

import { RankingView } from "@/features/rankings/RankingView";

// Single-room MVP: the ranking always refers to the "principal" room, same as the home ("/").
export default function RankingPage() {
  return <RankingView roomSlug="principal" />;
}

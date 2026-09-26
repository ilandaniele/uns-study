import { RankingView } from "@/features/rankings/RankingView";

// Single-room MVP: the ranking always refers to the "principal" room, same as "/" -> "/sala/principal".
export default function RankingPage() {
  return <RankingView roomSlug="principal" />;
}

import { redirect } from "next/navigation";

export default async function PlacementAccountPage({ params }: { params: Promise<{ slug: string; accountId: string }> }) {
  const { slug, accountId } = await params;
  redirect(`/w/${slug}/placement/${accountId}/loss-runs`);
}

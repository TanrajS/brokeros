import { redirect } from "next/navigation";

/** v1.3: Placement moved into the account tabs. The old index goes to the Book. */
export default async function PlacementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/w/${slug}`);
}

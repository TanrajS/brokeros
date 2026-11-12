import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Placement" };

export default function PlacementPage() {
  return (
    <PlaceholderPage
      title="Placement"
      version="v0.4"
      description="Submissions, quotes and quote options side by side, so you can compare carriers and bind the right tower."
    />
  );
}

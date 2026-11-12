import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Dashboard"
      version="v0.3"
      description="Book-level charts: premium and commission by line, carrier concentration, and the expiry curve over the next twelve months."
    />
  );
}

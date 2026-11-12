import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Renewals" };

export default function RenewalsPage() {
  return (
    <PlaceholderPage
      title="Renewals"
      version="v0.2"
      description="A renewal pipeline that ranks every policy by days to expiry from the as-of date, with status, owner and next step on one screen."
    />
  );
}

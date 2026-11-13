import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Marketing" };

export default function MarketingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Marketing is coming in v0.6</CardTitle>
        <CardDescription>Submissions to carriers, their responses and quote options side by side, with the quote comparison built from the loss runs.</CardDescription>
      </CardHeader>
    </Card>
  );
}

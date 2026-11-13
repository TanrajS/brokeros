import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Strategy" };

export default function StrategyPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy is coming in v0.7</CardTitle>
        <CardDescription>The renewal strategy: target terms, carrier shortlist and the story the loss runs and rate history tell underwriters.</CardDescription>
      </CardHeader>
    </Card>
  );
}

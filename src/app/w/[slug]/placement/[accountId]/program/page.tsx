import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Program" };

export default function ProgramPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Program is coming in v0.5</CardTitle>
        <CardDescription>The account&apos;s insurance program on one page: every line, limit, carrier and tower layer, with gaps against contract requirements.</CardDescription>
      </CardHeader>
    </Card>
  );
}

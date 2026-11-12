"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDemoBookAction } from "@/server/workspace/actions";

export function WelcomeCard({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function loadDemo() {
    startTransition(async () => {
      const res = await loadDemoBookAction(slug, { replace: false });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Demo book loaded", { description: `${res.data.accounts} accounts and ${res.data.policies} policies, all fictional.` });
      router.refresh();
    });
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Welcome to your workspace</CardTitle>
        <CardDescription>
          This workspace is empty. Load a fictional demo book to explore, or start adding your own accounts. Anyone with this
          page&apos;s link shares the same data.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" onClick={loadDemo} disabled={pending}>
          {pending ? "Loading…" : "Load demo book"}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/w/${slug}/accounts/new`}>Start with an empty book</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

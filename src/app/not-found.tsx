import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-muted-foreground">That workspace, account or policy does not exist, or the link is wrong.</p>
      <Button asChild>
        <Link href="/">Go to my workspace</Link>
      </Button>
    </main>
  );
}

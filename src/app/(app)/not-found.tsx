import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <FileQuestion className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This record doesn&apos;t exist, or it has been deleted.
        </p>
        <Link href="/" className={`mt-4 inline-flex ${buttonVariants({ variant: "outline" })}`}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

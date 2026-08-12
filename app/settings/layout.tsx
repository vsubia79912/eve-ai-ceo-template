import { ArrowLeftIcon, BotIcon, GitForkIcon, GitPullRequestArrowIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export default function SettingsLayout({ children }: { readonly children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl overflow-y-auto px-6 py-10">
      <Button asChild className="-ml-3" size="sm" variant="ghost">
        <Link href="/">
          <ArrowLeftIcon />
          Back to chat
        </Link>
      </Button>
      <nav aria-label="Settings" className="my-6 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/models"><BotIcon />Model settings</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/github"><GitForkIcon />GitHub repositories</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/automation"><GitPullRequestArrowIcon />Automation settings</Link>
        </Button>
      </nav>
      {children}
    </main>
  );
}

import { ActivityIcon, ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getStatusCards,
  getStatusOverview,
  SETUP_GUIDE_URL,
  type StatusCard,
  type StatusTone,
} from "@/lib/status";
import { getSetupStatus } from "@/lib/setup";
import { cn } from "@/lib/utils";

export const instant = false;

const toneStyles: Record<
  StatusTone,
  {
    readonly badge: string;
    readonly border: string;
    readonly dot: string;
  }
> = {
  attention: {
    badge:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    border: "border-amber-500/20 bg-amber-500/5",
    dot: "bg-amber-500",
  },
  info: {
    badge: "border-border bg-muted/60 text-foreground",
    border: "border-border bg-card",
    dot: "bg-foreground/55",
  },
  ready: {
    badge:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-500/20 bg-emerald-500/5",
    dot: "bg-emerald-500",
  },
};

export default async function StatusPage() {
  const setupStatus = await getSetupStatus();
  const overview = getStatusOverview(setupStatus);
  const cards = getStatusCards(setupStatus);
  const overviewStyles = toneStyles[overview.tone];

  return (
    <main className="mx-auto w-full max-w-6xl overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-4">
              <Badge
                variant="outline"
                className={cn("rounded-full px-2.5 py-1 text-[11px]", overviewStyles.badge)}
              >
                {overview.badge}
              </Badge>
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                  Read-only system summary
                </p>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground">
                    <ActivityIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Status</h1>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {overview.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild className="h-8 rounded-md px-3 text-sm" variant="outline">
                <a href={SETUP_GUIDE_URL} rel="noreferrer" target="_blank">
                  Setup guide
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <StatusCardPanel card={card} key={card.id} />
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold">About this page</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            This status view is intentionally read-only. It reports whether the
            required setup pieces are present without showing environment values,
            tokens, or other secrets.
          </p>
        </section>
      </div>
    </main>
  );
}

function StatusCardPanel({ card }: { readonly card: StatusCard }) {
  const styles = toneStyles[card.tone];

  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-2xl border p-5 shadow-sm sm:p-6",
        styles.border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Setup check
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">{card.title}</h2>
        </div>
        <Badge
          variant="outline"
          className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px]", styles.badge)}
        >
          {card.label}
        </Badge>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.summary}</p>

      <ul className="mt-4 space-y-2 text-sm leading-6 text-foreground/90">
        {card.highlights.map((highlight) => (
          <li className="flex items-start gap-2" key={highlight}>
            <span
              aria-hidden
              className={cn("mt-2 size-1.5 shrink-0 rounded-full", styles.dot)}
            />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 pt-2">
        <a
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          href={card.action.href}
          rel="noreferrer"
          target="_blank"
        >
          {card.action.label}
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>
    </section>
  );
}

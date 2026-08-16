import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getTaskWithTimeline } from "@/lib/company/store";

export const instant = false;

export default async function TaskDetailPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await getTaskWithTimeline(id);
  } catch {
    notFound();
  }
  const { task, events, latestMergeAttempt } = data;
  return (
    <main className="mx-auto w-full max-w-5xl overflow-y-auto px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">Engineering run</p>
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{task.repository}</p>
        </div>
        <Badge variant="outline">{task.status.replaceAll("_", " ")}</Badge>
      </div>
      <dl className="mt-8 grid gap-4 rounded-xl border border-border p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Stage" value={task.currentStage} />
        <Fact label="Branch" value={task.workingBranch ?? "Pending"} />
        <Fact label="Assigned" value={task.assignedAgent} />
        <Fact label="Engineering session" value={task.eveSessionId ?? "Pending"} mono />
        <Fact label="Sandbox" value={task.sandboxId ?? "Pending"} mono />
        <Fact
          label="Codex thread"
          value={task.codingRunId ?? (task.error ? "Failed to start" : "Pending")}
          mono
        />
      </dl>
      {task.effectiveModels ? (
        <section className="mt-6 rounded-xl border border-border p-5">
          <h2 className="font-medium">Effective models</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries(task.effectiveModels).map(([role, model]) => (
              <Fact key={role} label={role} value={model} mono />
            ))}
          </dl>
        </section>
      ) : null}
      {task.blockingQuestion ? <section className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5"><h2 className="font-medium">Blocking question</h2><pre className="mt-3 whitespace-pre-wrap text-sm">{JSON.stringify(task.blockingQuestion, null, 2)}</pre></section> : null}
      {task.prUrl ? <a className="mt-6 inline-flex text-sm font-medium underline underline-offset-4" href={task.prUrl} rel="noreferrer" target="_blank">Open draft PR #{task.prNumber}</a> : null}
      {latestMergeAttempt ? (
        <section className="mt-6 rounded-xl border border-border p-5">
          <h2 className="font-medium">Latest merge attempt</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Status" value={latestMergeAttempt.status.replaceAll("_", " ")} />
            <Fact label="Head SHA" value={latestMergeAttempt.headSha ?? "Pending"} mono />
            <Fact label="Merge commit" value={latestMergeAttempt.mergeCommitSha ?? "Pending"} mono />
          </dl>
          {latestMergeAttempt.error ? <p className="mt-3 text-sm text-destructive">{latestMergeAttempt.error}</p> : null}
          {latestMergeAttempt.mergeCommitSha ? (
            <a className="mt-3 inline-flex text-sm font-medium underline underline-offset-4" href={`https://github.com/${task.repository}/commit/${latestMergeAttempt.mergeCommitSha}`} rel="noreferrer" target="_blank">Open merge commit</a>
          ) : null}
        </section>
      ) : null}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Event timeline</h2>
        <ol className="mt-5 border-l border-border pl-5">
          {events.map((event) => (
            <li className="relative pb-6" key={event.id}>
              <span className="absolute top-1.5 -left-[1.45rem] size-2 rounded-full bg-foreground" />
              <div className="flex flex-wrap items-baseline gap-2"><time className="text-xs text-muted-foreground">{event.createdAt.toLocaleString()}</time><span className="text-xs font-medium tracking-wide">{event.type.replaceAll("_", " ")}</span></div>
              <p className="mt-1 text-sm">{event.summary}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Fact({ label, value, mono = false }: { readonly label: string; readonly value: string; readonly mono?: boolean }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`mt-1 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd></div>;
}

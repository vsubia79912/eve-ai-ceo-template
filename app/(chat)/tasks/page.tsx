import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listTasks } from "@/lib/company/store";
import { getSetupStatus } from "@/lib/setup";

export const instant = false;

export default async function TasksPage() {
  const setup = await getSetupStatus();
  if (!setup.databaseConfigured) {
    return <TasksEmpty message="Configure DATABASE_URL and run migrations to enable durable tasks." />;
  }
  let tasks;
  try {
    tasks = await listTasks();
  } catch {
    return <TasksEmpty message="The company task tables are unavailable. Run pnpm db:migrate." />;
  }
  return (
    <main className="mx-auto w-full max-w-5xl overflow-y-auto px-6 py-10">
      <div className="mb-8">
        <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">Autonomous company</p>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="mt-2 text-sm text-muted-foreground">Operational state lives here; detailed model traces remain in eve and Vercel Agent Runs.</p>
      </div>
      {tasks.length === 0 ? (
        <TasksEmpty message="No tasks yet. Give the CEO a coding objective in chat." />
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <Link className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/30" href={`/tasks/${task.id}`} key={task.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-medium">{task.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{task.repository} · {task.workingBranch ?? task.baseBranch}</p>
                </div>
                <Badge variant="outline">{task.status.replaceAll("_", " ")}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span>Agent: {task.assignedAgent}</span>
                <span>Stage: {task.currentStage}</span>
                <span>Updated: {task.updatedAt.toLocaleString()}</span>
                {task.prUrl ? <span className="text-foreground">PR #{task.prNumber}</span> : null}
              </div>
              {task.blockingQuestion ? <p className="mt-4 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">Blocked: {String((task.blockingQuestion as { question?: unknown }).question ?? "CEO decision required")}</p> : null}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function TasksEmpty({ message }: { readonly message: string }) {
  return <main className="mx-auto w-full max-w-5xl px-6 py-10"><h1 className="text-2xl font-semibold">Activity</h1><p className="mt-4 text-sm text-muted-foreground">{message}</p></main>;
}

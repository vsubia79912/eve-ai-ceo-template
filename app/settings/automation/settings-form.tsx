"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type AutomationProject = {
  readonly id: string;
  readonly mergeMethod: string;
  readonly mergeMode: string;
  readonly name: string;
  readonly repository: string | null;
};

export function AutomationSettingsForm() {
  const [projects, setProjects] = useState<readonly AutomationProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings/automation")
      .then(async (response) => {
        const body = (await response.json()) as { error?: string; projects?: AutomationProject[] };
        if (!response.ok) throw new Error(body.error ?? "Failed to load automation settings.");
        setProjects(body.projects ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Failed to load settings."))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(project: AutomationProject) {
    setSavingId(project.id);
    setError(null);
    try {
      const mergeMode = project.mergeMode === "owner_requested" ? "disabled" : "owner_requested";
      const response = await fetch("/api/settings/automation", {
        body: JSON.stringify({ mergeMethod: "squash", mergeMode, projectId: project.id }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to save automation settings.");
      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, mergeMode } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to save automation settings.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading project automation...</p>;
  if (error && projects.length === 0) return <p className="text-sm text-destructive">{error}</p>;
  if (projects.length === 0) {
    return <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">Create an engineering task first; its project will appear here.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-800 dark:text-amber-200">
        Enabling this setting authorizes squash merging only when your latest chat message explicitly asks to merge that exact Eve-created PR. Checks, verification, review, ownership, and commit SHAs are revalidated before GitHub is changed.
      </div>
      {projects.map((project) => {
        const enabled = project.mergeMode === "owner_requested";
        return (
          <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between" key={project.id}>
            <div>
              <h2 className="font-medium">{project.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{project.repository ?? "Repository not assigned"}</p>
              <p className="mt-2 text-xs text-muted-foreground">Method: squash · Deployment: separate</p>
            </div>
            <Button
              disabled={savingId === project.id || !project.repository}
              onClick={() => void toggle(project)}
              variant={enabled ? "destructive" : "default"}
            >
              {savingId === project.id ? "Saving..." : enabled ? "Disable requested merges" : "Enable requested merges"}
            </Button>
          </section>
        );
      })}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

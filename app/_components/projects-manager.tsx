"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectSummary } from "@/lib/chat/types";

const NO_REPOSITORY = "__none__";

export function ProjectsManager() {
  const { projects, refreshProjects } = useChatShell();
  const [repositories, setRepositories] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repository, setRepository] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings/github", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as {
          readonly github?: { readonly repositories?: readonly { readonly fullName: string }[] };
        };
        setRepositories(data.github?.repositories?.map((item) => item.fullName) ?? []);
      })
      .catch(() => undefined);
  }, []);

  async function create() {
    if (!name.trim()) return;
    setSaving("new");
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        body: JSON.stringify({ description, name, repository }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await response.json() as { readonly error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to create project.");
      setName("");
      setDescription("");
      setRepository(null);
      await refreshProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to create project.");
    } finally {
      setSaving(null);
    }
  }

  async function save(project: ProjectSummary, patch: Partial<ProjectSummary>) {
    setSaving(project.id);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        body: JSON.stringify(patch),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const body = await response.json() as { readonly error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to update project.");
      await refreshProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to update project.");
    } finally {
      setSaving(null);
    }
  }

  async function remove(project: ProjectSummary) {
    if (!window.confirm(`Delete ${project.name}? Its chats will move to No project.`)) return;
    setSaving(project.id);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      const body = await response.json() as { readonly error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to delete project.");
      await refreshProjects();
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to delete project.");
      setSaving(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-medium">New project</h2>
          <p className="mt-1 text-sm text-muted-foreground">Start with a name. Everything else is optional.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input aria-label="Project name" onChange={(event) => setName(event.target.value)} placeholder="Project name" value={name} />
          <RepositorySelect onChange={setRepository} repositories={repositories} value={repository} />
        </div>
        <Textarea aria-label="Project description" onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" value={description} />
        <Button disabled={!name.trim() || saving === "new"} onClick={() => void create()}>
          {saving === "new" ? <Spinner /> : <PlusIcon />}
          Create project
        </Button>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">Your projects</h2>
          <p className="mt-1 text-sm text-muted-foreground">Chats can be moved in or out of these folders at any time.</p>
        </div>
        {projects.length ? projects.map((project) => (
          <ProjectEditor
            key={`${project.id}:${project.updatedAt}`}
            onDelete={remove}
            onSave={save}
            project={project}
            repositories={repositories}
            saving={saving === project.id}
          />
        )) : (
          <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">No projects yet. Chats continue to work without one.</p>
        )}
      </section>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function ProjectEditor({
  onDelete,
  onSave,
  project,
  repositories,
  saving,
}: {
  readonly onDelete: (project: ProjectSummary) => Promise<void>;
  readonly onSave: (project: ProjectSummary, patch: Partial<ProjectSummary>) => Promise<void>;
  readonly project: ProjectSummary;
  readonly repositories: readonly string[];
  readonly saving: boolean;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [repository, setRepository] = useState(project.repository);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input aria-label={`${project.name} name`} onChange={(event) => setName(event.target.value)} value={name} />
        <RepositorySelect onChange={setRepository} repositories={repositories} value={repository} />
      </div>
      <Input aria-label={`${project.name} description`} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" value={description} />
      <Textarea aria-label={`${project.name} instructions`} onChange={(event) => setInstructions(event.target.value)} placeholder="Instructions for chats in this project (optional)" value={instructions} />
      <div className="flex flex-wrap justify-between gap-2">
        <Button disabled={saving || !name.trim()} onClick={() => void onSave(project, { description, instructions, name, repository })}>
          {saving ? <Spinner /> : null}Save
        </Button>
        <Button disabled={saving} onClick={() => void onDelete(project)} variant="ghost">
          <Trash2Icon />Delete
        </Button>
      </div>
    </div>
  );
}

function RepositorySelect({
  onChange,
  repositories,
  value,
}: {
  readonly onChange: (value: string | null) => void;
  readonly repositories: readonly string[];
  readonly value: string | null;
}) {
  return (
    <Select onValueChange={(next) => onChange(next === NO_REPOSITORY ? null : next)} value={value ?? NO_REPOSITORY}>
      <SelectTrigger className="w-full"><SelectValue placeholder="No repository" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_REPOSITORY}>No repository</SelectItem>
        {repositories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

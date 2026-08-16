"use client";

import { FolderCogIcon, FolderIcon, GitForkIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_PROJECT = "__no_project__";
const NO_REPOSITORY = "__no_repository__";

export const NEW_CHAT_PROJECT_KEY = "eve-chat-project";
export const NEW_CHAT_REPOSITORY_KEY = "eve-chat-repository";

export function ChatContextControls({
  disabled = false,
  onProjectChange,
  onRepositoryChange,
  projectId,
  repository,
}: {
  readonly disabled?: boolean;
  readonly onProjectChange: (projectId: string | null, defaultRepository: string | null) => void;
  readonly onRepositoryChange: (repository: string | null) => void;
  readonly projectId: string | null;
  readonly repository: string | null;
}) {
  const { projects, setupStatus, viewer } = useChatShell();
  const [repositories, setRepositories] = useState<string[]>([]);

  useEffect(() => {
    if (!viewer || setupStatus.storageMode !== "database") return;
    void fetch("/api/settings/github", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as {
          readonly github?: { readonly repositories?: readonly { readonly fullName: string }[] };
        };
        setRepositories(data.github?.repositories?.map((item) => item.fullName) ?? []);
      })
      .catch(() => undefined);
  }, [setupStatus.storageMode, viewer]);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Select
        disabled={disabled}
        onValueChange={(value) => {
          const nextId = value === NO_PROJECT ? null : value;
          const selected = projects.find((project) => project.id === nextId);
          onProjectChange(nextId, selected?.repository ?? null);
        }}
        value={projectId ?? NO_PROJECT}
      >
        <SelectTrigger className="h-8 w-auto max-w-56 gap-2 border-0 bg-muted/50 px-2.5 shadow-none">
          <FolderIcon className="size-3.5 shrink-0" />
          <SelectValue placeholder="No project" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PROJECT}>No project</SelectItem>
          {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        disabled={disabled || setupStatus.storageMode !== "database"}
        onValueChange={(value) => onRepositoryChange(value === NO_REPOSITORY ? null : value)}
        value={repository ?? NO_REPOSITORY}
      >
        <SelectTrigger className="h-8 w-auto max-w-64 gap-2 border-0 bg-muted/50 px-2.5 shadow-none">
          <GitForkIcon className="size-3.5 shrink-0" />
          <SelectValue placeholder="No repository" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_REPOSITORY}>No repository</SelectItem>
          {repositories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button asChild aria-label="Manage projects" size="icon-sm" variant="ghost">
        <Link href="/projects"><FolderCogIcon /></Link>
      </Button>
    </div>
  );
}

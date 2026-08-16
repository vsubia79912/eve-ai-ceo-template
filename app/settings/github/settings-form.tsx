"use client";

import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  GitBranchIcon,
  LockIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Repository = {
  readonly archived: boolean;
  readonly defaultBranch: string;
  readonly fullName: string;
  readonly private: boolean;
};

type GitHubStatus = {
  readonly credentialMode: string;
  readonly managementUrl: string | null;
  readonly message: string;
  readonly permissions: { readonly contents: string | null; readonly pullRequests: string | null };
  readonly repositories: readonly Repository[];
  readonly status: string;
  readonly totalCount: number;
  readonly truncated: boolean;
};

type SettingsResponse = {
  readonly error?: string;
  readonly github?: GitHubStatus;
};

export function GitHubSettingsForm() {
  const [github, setGitHub] = useState<GitHubStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/github", { cache: "no-store" });
      const body = (await response.json()) as SettingsResponse;
      if (!response.ok || !body.github) {
        throw new Error(body.error ?? "Failed to load GitHub settings.");
      }
      setGitHub(body.github);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load GitHub settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Loading GitHub access...</p>;
  }
  if (!github) return <p className="text-sm text-destructive">{error ?? "GitHub settings are unavailable."}</p>;

  const connected = github.status === "connected";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">GitHub App access</h2>
              <Badge variant={connected ? "default" : "outline"}>
                {connected ? <CheckCircle2Icon /> : null}
                {connected ? "Connected" : github.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{github.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">Contents: {github.permissions.contents ?? "unknown"}</Badge>
              <Badge variant="secondary">Pull requests: {github.permissions.pullRequests ?? "unknown"}</Badge>
              <Badge variant="outline">{github.credentialMode.replaceAll("_", " ")}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button disabled={refreshing} onClick={() => void load(true)} size="sm" variant="outline">
              {refreshing ? <Spinner /> : <RefreshCwIcon />}
              Refresh
            </Button>
            {github.managementUrl ? (
              <Button asChild size="sm">
                <a href={github.managementUrl} rel="noreferrer" target="_blank">
                  Manage on GitHub <ExternalLinkIcon />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">Authorized repositories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing {github.repositories.length} of {github.totalCount} repositories{github.truncated ? ". Narrow the GitHub App selection to manage repositories beyond the first 100." : "."}
          </p>
        </div>
        {github.repositories.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {github.repositories.map((repository) => (
              <div className="flex min-w-0 items-center justify-between gap-4 px-4 py-3" key={repository.fullName}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{repository.fullName}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranchIcon className="size-3" />{repository.defaultBranch}
                    {repository.private ? <><span aria-hidden="true">·</span><LockIcon className="size-3" />Private</> : null}
                  </p>
                </div>
                {repository.archived ? <Badge variant="outline">Archived</Badge> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
            No repositories are currently authorized. Use Manage on GitHub to select one.
          </p>
        )}
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

import { GitHubSettingsForm } from "@/app/settings/github/settings-form";

export default function GitHubSettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">GitHub repositories</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Review repositories granted to the GitHub App and assign an authorized repository to each project. Repository access itself is managed on GitHub.
        </p>
      </header>
      <GitHubSettingsForm />
    </div>
  );
}

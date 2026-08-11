import { AutomationSettingsForm } from "@/app/settings/automation/settings-form";

export default function AutomationSettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Automation settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Control whether an explicit owner chat request may review and squash merge an Eve-created pull request. Vercel deployment remains separate.
        </p>
      </header>
      <AutomationSettingsForm />
    </div>
  );
}

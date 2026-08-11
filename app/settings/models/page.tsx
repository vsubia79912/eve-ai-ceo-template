import { ModelsSettingsForm } from "@/app/settings/models/settings-form";

export default function ModelsSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Agent models</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose which models appear in New Session and set agent-role defaults. Existing chats keep their CEO model.
      </p>
      <ModelsSettingsForm />
    </main>
  );
}

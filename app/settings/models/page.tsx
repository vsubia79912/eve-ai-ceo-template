import { ModelsSettingsForm } from "@/app/settings/models/settings-form";

export default function ModelsSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Agent models</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Defaults apply to new chats and are snapshotted onto engineering tasks. Existing chats keep their CEO model.
      </p>
      <ModelsSettingsForm />
    </main>
  );
}

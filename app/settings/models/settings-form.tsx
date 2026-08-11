"use client";

import { useEffect, useState } from "react";
import { ModelSelect } from "@/components/chat/model-select";
import { Button } from "@/components/ui/button";
import type { GatewayModel, ModelRole, ModelSettings } from "@/lib/chat/types";
import { DEFAULT_MODEL_SETTINGS } from "@/lib/models";

const LABELS: Record<ModelRole, string> = {
  ceo: "CEO",
  engineering: "Engineering orchestrator",
  reviewer: "Reviewer",
  codex: "Codex coding worker",
};

export function ModelsSettingsForm() {
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([fetch("/api/models"), fetch("/api/settings/models")])
      .then(async ([catalog, preferences]) => {
        if (!catalog.ok || !preferences.ok) throw new Error("Could not load model settings.");
        const catalogData = await catalog.json() as { models: GatewayModel[] };
        const settingsData = await preferences.json() as { settings: ModelSettings; storageMode: string };
        setModels(catalogData.models);
        const local = settingsData.storageMode === "browser"
          ? window.localStorage.getItem("eve-model-settings")
          : null;
        setSettings(local ? JSON.parse(local) as ModelSettings : settingsData.settings);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load models."));
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/models", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error("Could not save model settings.");
      const data = await response.json() as { settings: ModelSettings; storageMode: string };
      setSettings(data.settings);
      if (data.storageMode === "browser") {
        window.localStorage.setItem("eve-model-settings", JSON.stringify(data.settings));
      }
      setMessage("Model defaults saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save model settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      {(Object.keys(LABELS) as ModelRole[]).map((role) => (
        <section className="space-y-2" key={role}>
          <h2 className="font-medium">{LABELS[role]}</h2>
          <ModelSelect
            models={models}
            onChange={(modelId) => setSettings((current) => ({ ...current, [role]: modelId }))}
            searchable
            value={settings[role]}
          />
        </section>
      ))}
      <div className="flex items-center gap-3">
        <Button disabled={saving || models.length === 0} onClick={() => void save()}>
          {saving ? "Saving..." : "Save defaults"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}

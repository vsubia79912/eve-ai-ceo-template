"use client";

import { useEffect, useMemo, useState } from "react";
import { ModelSelect } from "@/components/chat/model-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GatewayModel, ModelRole, ModelSettings } from "@/lib/chat/types";
import {
  DEFAULT_MODEL_SETTINGS,
  DEFAULT_VISIBLE_MODEL_IDS,
  formatAverageModelPrice,
  MODEL_SETTINGS_STORAGE_KEY,
  modelsForNewSession,
  VISIBLE_MODELS_STORAGE_KEY,
} from "@/lib/models";

const LABELS: Record<ModelRole, string> = {
  ceo: "CEO",
  engineering: "Engineering orchestrator",
  reviewer: "Reviewer",
  codex: "Codex coding worker",
};

export function ModelsSettingsForm() {
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS);
  const [visibleModelIds, setVisibleModelIds] = useState<readonly string[]>(DEFAULT_VISIBLE_MODEL_IDS);
  const [pickerQuery, setPickerQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const visibleSet = useMemo(() => new Set(visibleModelIds), [visibleModelIds]);
  const pickerModels = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    return query
      ? models.filter((model) => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(query))
      : models;
  }, [models, pickerQuery]);

  useEffect(() => {
    void Promise.all([fetch("/api/models"), fetch("/api/settings/models")])
      .then(async ([catalog, preferences]) => {
        if (!catalog.ok || !preferences.ok) throw new Error("Could not load model settings.");
        const catalogData = await catalog.json() as { models: GatewayModel[] };
        const settingsData = await preferences.json() as {
          settings: ModelSettings;
          storageMode: string;
          visibleModelIds: string[];
        };
        setModels(catalogData.models);
        const local = settingsData.storageMode === "browser"
          ? window.localStorage.getItem(MODEL_SETTINGS_STORAGE_KEY)
          : null;
        const localVisible = settingsData.storageMode === "browser"
          ? window.localStorage.getItem(VISIBLE_MODELS_STORAGE_KEY)
          : null;
        setSettings(local ? JSON.parse(local) as ModelSettings : settingsData.settings);
        const storedVisibleModelIds = localVisible
          ? JSON.parse(localVisible) as string[]
          : settingsData.visibleModelIds ?? DEFAULT_VISIBLE_MODEL_IDS;
        setVisibleModelIds(
          modelsForNewSession(catalogData.models, storedVisibleModelIds).map((model) => model.id),
        );
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load models."));
  }, []);

  async function save() {
    if (visibleModelIds.length === 0) {
      setMessage("Enable at least one model for the New Session picker.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/models", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings, visibleModelIds }),
      });
      if (!response.ok) throw new Error("Could not save model settings.");
      const data = await response.json() as {
        settings: ModelSettings;
        storageMode: string;
        visibleModelIds: string[];
      };
      setSettings(data.settings);
      setVisibleModelIds(data.visibleModelIds);
      if (data.storageMode === "browser") {
        window.localStorage.setItem(MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(data.settings));
        window.localStorage.setItem(VISIBLE_MODELS_STORAGE_KEY, JSON.stringify(data.visibleModelIds));
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
      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Models shown in New Session</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable the models you want available in the main chat picker. This does not change agent-role defaults.
          </p>
        </div>
        <Input
          aria-label="Search models shown in New Session"
          onChange={(event) => setPickerQuery(event.target.value)}
          placeholder="Search provider or model..."
          value={pickerQuery}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setVisibleModelIds(models.filter((model) => model.recommended).map((model) => model.id))} size="sm" type="button" variant="outline">
            Recommended
          </Button>
          <Button onClick={() => setVisibleModelIds(models.map((model) => model.id))} size="sm" type="button" variant="outline">
            Enable all
          </Button>
          <Button onClick={() => setVisibleModelIds([])} size="sm" type="button" variant="ghost">
            Disable all
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {visibleModelIds.length} enabled
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border p-1">
          {pickerModels.map((model) => (
            <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm hover:bg-accent" key={model.id}>
              <input
                checked={visibleSet.has(model.id)}
                className="size-4 shrink-0 accent-foreground"
                onChange={(event) => setVisibleModelIds((current) => event.target.checked
                  ? [...current, model.id]
                  : current.filter((id) => id !== model.id))}
                type="checkbox"
              />
              <span className="min-w-0 flex-1 truncate">{model.name} · {model.provider}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatAverageModelPrice(model.pricing)}
              </span>
            </label>
          ))}
          {pickerModels.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No matching models.</p>
          ) : null}
        </div>
        {visibleModelIds.length === 0 ? (
          <p className="text-sm text-destructive">Enable at least one model before saving.</p>
        ) : null}
      </section>
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
        <Button disabled={saving || models.length === 0 || visibleModelIds.length === 0} onClick={() => void save()}>
          {saving ? "Saving..." : "Save defaults"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}

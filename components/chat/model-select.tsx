"use client";

import { useMemo, useState } from "react";
import type { GatewayModel } from "@/lib/chat/types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAverageModelPrice } from "@/lib/models";

export function ModelSelect({
  disabled,
  models,
  onChange,
  searchable = false,
  value,
}: {
  readonly disabled?: boolean;
  readonly models: readonly GatewayModel[];
  readonly onChange: (value: string) => void;
  readonly searchable?: boolean;
  readonly value: string;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? models.filter((model) => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(normalized))
      : models;
  }, [models, query]);

  return (
    <div className="space-y-2">
      {searchable ? (
        <Input
          aria-label="Search model catalog"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search provider or model..."
          value={query}
        />
      ) : null}
      <Select disabled={disabled} onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Select model" /></SelectTrigger>
        <SelectContent>
          {visible.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.name} · {model.provider} · {formatAverageModelPrice(model.pricing)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {models.find((model) => model.id === value) ? (
        <ModelDetails model={models.find((model) => model.id === value)!} />
      ) : null}
    </div>
  );
}

function ModelDetails({ model }: { readonly model: GatewayModel }) {
  const expensive = pricePerMillion(model.pricing.input) >= 5 || pricePerMillion(model.pricing.output) >= 20;
  return (
    <p className="text-xs text-muted-foreground">
      {model.contextWindow ? `${formatTokens(model.contextWindow)} context` : "Context not listed"}
      {model.pricing.input ? ` · ${formatPrice(model.pricing.input)} input` : ""}
      {model.pricing.output ? ` · ${formatPrice(model.pricing.output)} output` : ""}
      {expensive ? " · Higher-cost model" : ""}
    </p>
  );
}

function pricePerMillion(value: string | null) {
  return value ? Number(value) * 1_000_000 : 0;
}

function formatPrice(value: string) {
  return `$${pricePerMillion(value).toFixed(2)}/1M`;
}

function formatTokens(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${Math.round(value / 1_000)}K`;
}

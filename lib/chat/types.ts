import type { ClientSessionState, MessageStreamEvent } from "eve/client";

export type Viewer = {
  readonly email: string;
  readonly id: string;
  readonly image: string | null;
  readonly name: string;
};

export type AuthMode = "local-dev" | "password" | "unconfigured" | "vercel";
export type StorageMode = "browser" | "database";

export type ChatListItem = {
  readonly id: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly repository: string | null;
  readonly title: string;
  readonly updatedAt: string;
};

export type ChatListPage = {
  readonly items: readonly ChatListItem[];
  readonly nextCursor: string | null;
};

export type ActiveChat = {
  readonly events: readonly MessageStreamEvent[];
  readonly hasOlderHistory: boolean;
  readonly historyStartIndex: number | null;
  readonly id: string;
  readonly modelId: string;
  readonly nextEventIndex: number;
  readonly pendingUserMessage: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly repository: string | null;
  readonly session: ClientSessionState | undefined;
  readonly title: string;
};

export type ProjectSummary = {
  readonly description: string | null;
  readonly id: string;
  readonly instructions: string | null;
  readonly name: string;
  readonly repository: string | null;
  readonly updatedAt: string;
};

export type ModelRole = "ceo" | "engineering" | "reviewer" | "codex";

export type ModelSettings = Record<ModelRole, string>;

export type UserModelPreferences = {
  readonly settings: ModelSettings;
  readonly visibleModelIds: readonly string[];
};

export type GatewayModel = {
  readonly contextWindow: number | null;
  readonly description: string;
  readonly id: string;
  readonly maxOutputTokens: number | null;
  readonly name: string;
  readonly pricing: {
    readonly cachedInput: string | null;
    readonly input: string | null;
    readonly output: string | null;
  };
  readonly provider: string;
  readonly recommended: boolean;
};

export type SetupStatus = {
  readonly appReady: boolean;
  readonly authMode: AuthMode;
  readonly authReady: boolean;
  readonly connectionsAvailable: boolean;
  readonly databaseConfigured: boolean;
  readonly databaseReady: boolean;
  readonly databaseSchemaReady: boolean;
  readonly missing: readonly string[];
  readonly rateLimitReady: boolean;
  readonly storageMode: StorageMode;
};

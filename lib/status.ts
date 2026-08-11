import type { SetupStatus } from "./chat/types.ts";

export const SETUP_GUIDE_URL =
  "https://github.com/vercel-labs/eve-chat-template/blob/main/docs/setup-and-deploy.md";
export const VERCEL_AUTH_DOCS_URL =
  "https://vercel.com/docs/sign-in-with-vercel/getting-started#prerequisites";

export type StatusTone = "attention" | "info" | "ready";

export type StatusCard = {
  readonly action: {
    readonly href: string;
    readonly label: string;
  };
  readonly highlights: readonly string[];
  readonly id:
    | "authentication"
    | "database-connectivity"
    | "database-schema"
    | "rate-limiting";
  readonly label: string;
  readonly summary: string;
  readonly title: string;
  readonly tone: StatusTone;
};

export type StatusOverview = {
  readonly badge: string;
  readonly description: string;
  readonly tone: StatusTone;
};

export function getStatusOverview(setupStatus: SetupStatus): StatusOverview {
  if (!setupStatus.appReady) {
    if (setupStatus.authMode === "vercel" && setupStatus.databaseConfigured) {
      return {
        badge: "Finishing production setup",
        description:
          "Most production services are in place. Finish the database schema check so the app can fully open for chat and sign-in.",
        tone: "attention",
      };
    }

    return {
      badge: "Setup required",
      description:
        "This page shows which setup steps still need attention before the app can accept chats or sign users in.",
      tone: "attention",
    };
  }

  if (setupStatus.authMode === "vercel") {
    return {
      badge: "Production mode",
      description:
        "Durable database storage, Vercel sign-in, and distributed rate limiting are active for multi-user operation.",
      tone: "ready",
    };
  }

  if (setupStatus.authMode === "password") {
    return {
      badge: "Starter mode",
      description:
        "A shared password sign-in is active for one trusted operator. Chat history stays in this browser until production services are added.",
      tone: "info",
    };
  }

  return {
    badge: "Local development",
    description:
      "Local development mode is active on this machine, with browser storage and a development-only sign-in bypass.",
    tone: "info",
  };
}

export function getStatusCards(setupStatus: SetupStatus): readonly StatusCard[] {
  return [
    getAuthenticationCard(setupStatus),
    getDatabaseConnectivityCard(setupStatus),
    getDatabaseSchemaCard(setupStatus),
    getRateLimitingCard(setupStatus),
  ];
}

function getAuthenticationCard(setupStatus: SetupStatus): StatusCard {
  if (setupStatus.authMode === "vercel") {
    return {
      action: {
        href: VERCEL_AUTH_DOCS_URL,
        label: "Vercel OAuth setup",
      },
      highlights: setupStatus.databaseSchemaReady
        ? [
            "Vercel sign-in is configured for individual user sessions.",
            "The required Better Auth tables have been detected.",
          ]
        : [
            "Vercel sign-in settings are present.",
            "Finish the database schema so the sign-in flow can complete end to end.",
          ],
      id: "authentication",
      label: setupStatus.databaseSchemaReady ? "Ready" : "Needs schema check",
      summary: setupStatus.databaseSchemaReady
        ? "Users can sign in with Vercel and keep their own durable chat history."
        : "Authentication settings are in place, but the database schema still needs attention before sign-in is fully available.",
      title: "Authentication",
      tone: setupStatus.databaseSchemaReady ? "ready" : "attention",
    };
  }

  if (setupStatus.authMode === "password") {
    return {
      action: {
        href: SETUP_GUIDE_URL,
        label: "Production auth guide",
      },
      highlights: [
        "A shared starter password signs in one trusted operator.",
        "Upgrade to Vercel sign-in when you are ready for independent user accounts.",
      ],
      id: "authentication",
      label: "Starter mode",
      summary:
        "Password sign-in is active, which is a good fit for a private single-operator setup.",
      title: "Authentication",
      tone: "info",
    };
  }

  if (setupStatus.authMode === "local-dev") {
    return {
      action: {
        href: SETUP_GUIDE_URL,
        label: "Production auth guide",
      },
      highlights: [
        "Local development skips production sign-in so you can iterate quickly on one machine.",
        "Vercel sign-in is still required before deploying for multi-user access.",
      ],
      id: "authentication",
      label: "Local only",
      summary:
        "A development-only sign-in bypass is active for local work on this machine.",
      title: "Authentication",
      tone: "info",
    };
  }

  return {
    action: {
      href: SETUP_GUIDE_URL,
      label: "Open setup guide",
    },
    highlights: [
      "Choose either the starter password path or the full Vercel sign-in path.",
      "The app stays read-only until one of those authentication options is configured.",
    ],
    id: "authentication",
    label: "Needs setup",
    summary: "Authentication is not configured yet.",
    title: "Authentication",
    tone: "attention",
  };
}

function getDatabaseConnectivityCard(setupStatus: SetupStatus): StatusCard {
  if (setupStatus.databaseConfigured) {
    if (setupStatus.storageMode === "database") {
      return {
        action: {
          href: SETUP_GUIDE_URL,
          label: "Database setup guide",
        },
        highlights: [
          "Durable chat history uses the connected database in production mode.",
          "Schema details are shown separately below so configuration and migrations stay easy to read.",
        ],
        id: "database-connectivity",
        label: "Configured",
        summary:
          "Database connection settings are present for durable, per-user storage.",
        title: "Database connectivity",
        tone: "ready",
      };
    }

    return {
      action: {
        href: SETUP_GUIDE_URL,
        label: "Production storage guide",
      },
      highlights: [
        "The project has database connection settings available.",
        "Starter and local-development modes still keep chat history in the current browser until the full production stack is enabled.",
      ],
      id: "database-connectivity",
      label: "Available",
      summary:
        "A database is connected, even though this environment is still running in browser-storage mode.",
      title: "Database connectivity",
      tone: "info",
    };
  }

  return {
    action: {
      href: SETUP_GUIDE_URL,
      label: "Connect a database",
    },
    highlights: setupStatus.appReady
      ? [
          "Starter mode can work without a database by storing chat history in this browser.",
          "Add a database when you want durable, multi-user storage.",
        ]
      : [
          "Connect Neon Postgres to unlock durable chat history and production auth.",
          "Once a database is attached, this page can also confirm schema readiness.",
        ],
    id: "database-connectivity",
    label: setupStatus.appReady ? "Optional in starter mode" : "Needs setup",
    summary: setupStatus.appReady
      ? "No database is connected yet, so this environment keeps data in the current browser."
      : "A database still needs to be connected before the production stack is complete.",
    title: "Database connectivity",
    tone: setupStatus.appReady ? "info" : "attention",
  };
}

function getDatabaseSchemaCard(setupStatus: SetupStatus): StatusCard {
  if (!setupStatus.databaseConfigured) {
    return {
      action: {
        href: SETUP_GUIDE_URL,
        label: "Migration guide",
      },
      highlights: setupStatus.appReady
        ? [
            "Starter mode does not require database tables for chat history.",
            "Schema checks begin after a database is connected.",
          ]
        : [
            "Connect the database first, then run the production migrations.",
            "The required auth, chat, and task tables are checked automatically after that.",
          ],
      id: "database-schema",
      label: setupStatus.appReady ? "Not in use" : "Pending",
      summary: setupStatus.appReady
        ? "Schema checks are skipped until a database is connected."
        : "The app cannot confirm its database schema until a database is connected.",
      title: "Database schema",
      tone: setupStatus.appReady ? "info" : "attention",
    };
  }

  if (setupStatus.databaseSchemaReady) {
    return {
      action: {
        href: SETUP_GUIDE_URL,
        label: "Migration commands",
      },
      highlights: [
        "The required auth, chat, and engineering task tables were detected.",
        "Schema setup is ready for durable operation.",
      ],
      id: "database-schema",
      label: "Ready",
      summary: "The required database tables are available.",
      title: "Database schema",
      tone: "ready",
    };
  }

  if (setupStatus.storageMode === "browser") {
    return {
      action: {
        href: SETUP_GUIDE_URL,
        label: "Production migration guide",
      },
      highlights: [
        "Starter and local-development modes do not depend on the database tables to run chat.",
        "When the full production prerequisites are present, the app will confirm the required tables automatically.",
      ],
      id: "database-schema",
      label: "Waiting on production checks",
      summary:
        "Database schema confirmation stays pending until the full production stack is enabled.",
      title: "Database schema",
      tone: "info",
    };
  }

  return {
    action: {
      href: SETUP_GUIDE_URL,
      label: "Run migrations",
    },
    highlights: [
      "Run the production migration command from the setup guide.",
      "Refresh this page afterward to confirm that the required tables are available.",
    ],
    id: "database-schema",
    label: "Needs migrations",
    summary:
      "The app could not confirm the required database tables yet.",
    title: "Database schema",
    tone: "attention",
  };
}

function getRateLimitingCard(setupStatus: SetupStatus): StatusCard {
  if (setupStatus.rateLimitReady) {
    return {
      action: {
        href: SETUP_GUIDE_URL,
        label: "Rate-limit setup",
      },
      highlights: [
        "Distributed request limits are configured for deployed environments.",
        "This helps protect chat and authentication flows under shared usage.",
      ],
      id: "rate-limiting",
      label: "Ready",
      summary: "Distributed rate limiting is configured.",
      title: "Rate limiting",
      tone: "ready",
    };
  }

  if (setupStatus.authMode === "password" || setupStatus.authMode === "local-dev") {
    return {
      action: {
        href: SETUP_GUIDE_URL,
        label: "Production rate-limit guide",
      },
      highlights: [
        "Single-operator and local-development setups can work without distributed rate limiting.",
        "Add Upstash Redis before opening access to a broader set of users.",
      ],
      id: "rate-limiting",
      label: "Optional in starter mode",
      summary:
        "Rate limiting is not configured yet, which is acceptable for private starter or local-development use.",
      title: "Rate limiting",
      tone: "info",
    };
  }

  return {
    action: {
      href: SETUP_GUIDE_URL,
      label: "Configure rate limiting",
    },
    highlights: [
      "Add Upstash Redis so the app can enforce shared request limits across deployments.",
      "The full production path expects rate limiting before chat is opened up broadly.",
    ],
    id: "rate-limiting",
    label: "Needs setup",
    summary: "Distributed rate limiting still needs production configuration.",
    title: "Rate limiting",
    tone: "attention",
  };
}

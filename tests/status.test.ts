import assert from "node:assert/strict";
import test from "node:test";
import {
  getStatusCards,
  getStatusOverview,
  SETUP_GUIDE_URL,
  VERCEL_AUTH_DOCS_URL,
} from "../lib/status.ts";
import {
  isSidebarNavItemActive,
  SIDEBAR_NAV_ITEMS,
} from "../lib/chat/navigation.ts";
import type { SetupStatus } from "../lib/chat/types.ts";

const READY_PRODUCTION_STATUS: SetupStatus = {
  appReady: true,
  authMode: "vercel",
  authReady: true,
  connectionsAvailable: true,
  databaseConfigured: true,
  databaseReady: true,
  databaseSchemaReady: true,
  missing: [],
  rateLimitReady: true,
  storageMode: "database",
};

const STARTER_STATUS: SetupStatus = {
  appReady: true,
  authMode: "password",
  authReady: true,
  connectionsAvailable: false,
  databaseConfigured: false,
  databaseReady: false,
  databaseSchemaReady: false,
  missing: [],
  rateLimitReady: false,
  storageMode: "browser",
};

const UNCONFIGURED_STATUS: SetupStatus = {
  appReady: false,
  authMode: "unconfigured",
  authReady: false,
  connectionsAvailable: false,
  databaseConfigured: false,
  databaseReady: false,
  databaseSchemaReady: false,
  missing: [
    "EVE_CHAT_PASSWORD",
    "or DATABASE_URL, Better Auth/Vercel OAuth, and Upstash configuration",
  ],
  rateLimitReady: false,
  storageMode: "browser",
};

test("builds a friendly production-ready status overview and cards", () => {
  const overview = getStatusOverview(READY_PRODUCTION_STATUS);
  const cards = getStatusCards(READY_PRODUCTION_STATUS);

  assert.equal(overview.badge, "Production mode");
  assert.match(overview.description, /Durable database storage/i);
  assert.deepEqual(
    cards.map((card) => card.id),
    [
      "authentication",
      "database-connectivity",
      "database-schema",
      "rate-limiting",
    ],
  );
  assert.equal(cards.every((card) => card.tone === "ready"), true);
  assert.equal(cards[0]?.action.href, VERCEL_AUTH_DOCS_URL);
});

test("describes starter mode without requiring a database or rate limiting", () => {
  const overview = getStatusOverview(STARTER_STATUS);
  const cards = getStatusCards(STARTER_STATUS);
  const authCard = cards.find((card) => card.id === "authentication");
  const databaseCard = cards.find((card) => card.id === "database-connectivity");
  const schemaCard = cards.find((card) => card.id === "database-schema");
  const rateLimitCard = cards.find((card) => card.id === "rate-limiting");

  assert.equal(overview.badge, "Starter mode");
  assert.equal(authCard?.label, "Starter mode");
  assert.equal(databaseCard?.label, "Optional in starter mode");
  assert.equal(schemaCard?.label, "Not in use");
  assert.equal(rateLimitCard?.label, "Optional in starter mode");
  assert.equal(databaseCard?.action.href, SETUP_GUIDE_URL);
});

test("keeps incomplete setup copy focused on missing capabilities", () => {
  const overview = getStatusOverview(UNCONFIGURED_STATUS);
  const cards = getStatusCards(UNCONFIGURED_STATUS);
  const combinedCopy = cards
    .flatMap((card) => [card.title, card.label, card.summary, ...card.highlights])
    .join(" ");

  assert.equal(overview.badge, "Setup required");
  assert.equal(cards.filter((card) => card.tone === "attention").length, 4);
  assert.doesNotMatch(combinedCopy, /super-secret|token-value|sk_live/i);
  assert.match(combinedCopy, /read-only|needs setup|database|rate limiting/i);
});

test("sidebar navigation exports a status entry and active-route matching", () => {
  const statusItem = SIDEBAR_NAV_ITEMS.find((item) => item.href === "/status");
  const tasksItem = SIDEBAR_NAV_ITEMS.find((item) => item.href === "/tasks");

  assert.ok(statusItem);
  assert.equal(statusItem?.label, "Status");
  assert.ok(tasksItem);
  assert.equal(isSidebarNavItemActive("/status", statusItem!), true);
  assert.equal(isSidebarNavItemActive("/tasks/123", tasksItem!), true);
  assert.equal(isSidebarNavItemActive("/", statusItem!), false);
});

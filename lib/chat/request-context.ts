import { cache } from "react";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export const getChatRequestSetupStatus = cache(getSetupStatus);

export const getChatRequestViewer = cache(async () => {
  const setupStatus = await getChatRequestSetupStatus();
  return getServerViewer(setupStatus);
});

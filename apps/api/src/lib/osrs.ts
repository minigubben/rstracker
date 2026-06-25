import { createHash } from "node:crypto";

import { z } from "zod";

const skillSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  rank: z.number().int(),
  level: z.number().int(),
  xp: z.number().int(),
});

const activitySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  rank: z.number().int(),
  score: z.number().int(),
});

const hiscoreSchema = z.object({
  name: z.string(),
  skills: z.array(skillSchema),
  activities: z.array(activitySchema),
});

export type HiscorePayload = z.infer<typeof hiscoreSchema>;

export class OsrsNotFoundError extends Error {}

export async function fetchHiscores(playerName: string) {
  const endpoint = new URL(
    "https://secure.runescape.com/m=hiscore_oldschool/index_lite.json",
  );
  endpoint.searchParams.set("player", playerName);

  const response = await fetch(endpoint);
  if (response.status === 404) {
    throw new OsrsNotFoundError(`Character ${playerName} was not found`);
  }

  if (!response.ok) {
    throw new Error(`OSRS hiscore request failed with ${response.status}`);
  }

  const payload = hiscoreSchema.parse(await response.json());
  return {
    fetchedAt: new Date(),
    httpStatus: response.status,
    payload,
    payloadHash: createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
  };
}

import { closePool } from "@rstracker/db";

import { createApp } from "./create-app.js";
import { getEnv } from "./env.js";
import { runPendingSyncs } from "./lib/sync-service.js";

const env = getEnv();
const app = createApp(env);

let timer: NodeJS.Timeout | undefined;

async function main() {
  if (!env.DISABLE_SYNC_WORKER) {
    timer = setInterval(() => {
      void runPendingSyncs().catch((error) => {
        console.error("Sync loop failed", error);
      });
    }, env.SYNC_INTERVAL_MS);

    void runPendingSyncs().catch((error) => {
      console.error("Initial sync loop failed", error);
    });
  }

  const server = app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });

  const shutdown = async () => {
    if (timer) {
      clearInterval(timer);
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await closePool();
  };

  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}

main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exitCode = 1;
});

//src/workers/tokenCleanup.ts
import { authService } from "../features/auth/auth.service.js";
import { redisClient } from "../db/redis.js";

let refreshFailures = 0;
let redisFailures = 0;

export const startTokenCleanupWorker = () => {
  console.log("🧹  Starting Background Token Cleanup Worker (Redis-Locked)...");

  const CLEANUP_INTERVAL = 1000 * 60 * 60; // 1 hour

  const runCleanupCycle = async () => {
    try {
      let lockAcquired: string | null | unknown = null;

      try {
        lockAcquired = await redisClient.set(
          "cron:token-cleanup-lock",
          "locked",
          {
            nx: true,
            ex: 300,
          },
        );
      } catch (redisErr) {
        redisFailures++;
        process.stderr.write(
          `[CRON_REDIS_DOWN] Token cleanup: Redis lock acquisition failed (consecutive failures=${redisFailures}). Cycle skipped. err=${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
        );
        if (redisFailures >= 5) {
          process.stderr.write(
            `[CRON_CRITICAL] Token cleanup has failed ${redisFailures} consecutive cycles. token tables are growing unboundedly. Investigate Redis health immediately.\n`,
          );
        }
        return;
      }

      if (!lockAcquired) {
        redisFailures = 0;
        refreshFailures = 0;
        return;
      }

      // 1. Clean Expired Refresh Tokens
      try {
        await authService.deleteExpiredRefreshTokens();
        refreshFailures = 0;
      } catch (dbErr) {
        refreshFailures++;
        process.stderr.write(
          `[CRON_DB_FAIL] Refresh Token cleanup: DB query failed (consecutive failures=${refreshFailures}). code=${(dbErr as any)?.code || "n/a"} err=${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
        );
        if (refreshFailures >= 5) {
          process.stderr.write(
            `[CRON_CRITICAL] Refresh Token cleanup has failed ${refreshFailures} consecutive cycles on the DB side. refresh_tokens table is growing unboundedly. Investigate PostgreSQL health immediately.\n`,
          );
        }
      }
    } finally {
      setTimeout(runCleanupCycle, CLEANUP_INTERVAL);
    }
  };

  setTimeout(runCleanupCycle, CLEANUP_INTERVAL);
};

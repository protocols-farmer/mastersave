// src/workers/depositReconciliation.ts
import { financeService } from "../features/finance/finance.service.js";
import { redisClient } from "../db/redis.js";

let reconcileFailures = 0;
let redisFailures = 0;

export const startDepositReconciliationWorker = () => {
  console.log("💸  Starting Background Deposit Reconciliation Worker...");

  const RECONCILE_INTERVAL = 1000 * 60 * 5; // 5 minutes
  const FIRST_RUN_DELAY = 1000 * 60; // 1 minute after boot, so a restart quickly picks up lost webhooks

  const runReconcileCycle = async () => {
    try {
      // The Redis lock only stops several server instances from working at the same time.
      // Deposits are money, so if Redis is DOWN we still run the cycle (fail open).
      let lockAcquired: string | null | unknown = null;
      let redisIsDown = false;

      try {
        lockAcquired = await redisClient.set(
          "cron:deposit-reconcile-lock",
          "locked",
          {
            nx: true,
            ex: 240,
          },
        );
      } catch (redisErr) {
        redisIsDown = true;
        redisFailures++;
        process.stderr.write(
          `[CRON_REDIS_DOWN] Deposit reconciliation: Redis lock failed (consecutive failures=${redisFailures}). Running the cycle WITHOUT the lock. err=${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
        );
      }

      if (!redisIsDown && !lockAcquired) {
        // Another instance is already running this cycle
        redisFailures = 0;
        return;
      }

      if (!redisIsDown) {
        redisFailures = 0;
      }

      try {
        const summary = await financeService.reconcileStalePendingDeposits();
        reconcileFailures = 0;

        if (summary.checked > 0) {
          console.log(
            `💸  Deposit reconciliation: checked=${summary.checked} credited=${summary.credited} markedFailed=${summary.markedFailed} stillPending=${summary.stillPending}`,
          );
        }

        if (summary.stoppedEarly) {
          process.stderr.write(
            `[CRON_PROVIDER_WARN] Deposit reconciliation stopped early because Flutterwave or the network had a problem. It will retry next cycle.\n`,
          );
        }
      } catch (reconcileErr) {
        reconcileFailures++;
        process.stderr.write(
          `[CRON_DB_FAIL] Deposit reconciliation failed (consecutive failures=${reconcileFailures}). code=${(reconcileErr as any)?.code || "n/a"} err=${(reconcileErr as Error).message}\nStack: ${(reconcileErr as Error).stack}\n`,
        );
        if (reconcileFailures >= 5) {
          process.stderr.write(
            `[CRON_CRITICAL] Deposit reconciliation has failed ${reconcileFailures} consecutive cycles. Paid deposits may not be getting credited. Investigate PostgreSQL health immediately.\n`,
          );
        }
      }
    } finally {
      setTimeout(runReconcileCycle, RECONCILE_INTERVAL);
    }
  };

  setTimeout(runReconcileCycle, FIRST_RUN_DELAY);
};

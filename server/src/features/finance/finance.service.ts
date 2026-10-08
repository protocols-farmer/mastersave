//src/features/finance/finance.service.ts
import { pool } from "../../db/psql.js";
import axios from "axios";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import {
  FLUTTERWAVE_SECRET_KEY,
  WITHDRAWAL_COOLDOWN_MINUTES,
} from "../../config/env.js";

export const financeService = {
  // Money handlers call this first: a deleted account must not move money,
  // even if its 15-minute access token is still valid.
  async getActiveUserForFinance(userId: string) {
    const sql = `
      SELECT id, email, phone_number, role
      FROM users
      WHERE id = $1 AND deleted_at IS NULL;
    `;
    try {
      const result = await pool.query(sql, [userId]);
      return result.rows[0];
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - getActiveUserForFinance]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  // Account deletion is refused while the student still has money in the app or a deposit in flight
  async getAccountDeletionBlockers(userId: string) {
    const sql = `
      SELECT
        (
          w.spend_balance + w.undecided_balance
          + COALESCE((SELECT SUM(g.saved_amount) FROM savings_goals g WHERE g.user_id = w.user_id AND g.status = 'active'), 0)
        ) AS total_balance,
        (
          SELECT COUNT(*)::int
          FROM transactions t
          WHERE t.user_id = w.user_id AND t.type = 'deposit' AND t.status = 'pending'
        ) AS pending_deposits
      FROM wallets w
      WHERE w.user_id = $1;
    `;
    try {
      const result = await pool.query(sql, [userId]);
      return result.rows[0];
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - getAccountDeletionBlockers]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async getDashboard(userId: string) {
    // save_balance is the total across the student's active goals
    const sql = `
      SELECT
        w.spend_balance,
        w.undecided_balance,
        COALESCE(g.total_saved, 0) AS save_balance,
        COALESCE(g.active_goals, 0) AS active_goal_count,
        a.spend_percentage,
        a.save_percentage
      FROM wallets w
      JOIN allocation_rules a ON a.user_id = w.user_id
      LEFT JOIN (
        SELECT user_id, SUM(saved_amount) AS total_saved, COUNT(*)::int AS active_goals
        FROM savings_goals
        WHERE status = 'active'
        GROUP BY user_id
      ) g ON g.user_id = w.user_id
      WHERE w.user_id = $1;
    `;
    try {
      const result = await pool.query(sql, [userId]);
      return result.rows[0];
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - getDashboard]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async updateRules(userId: string, spend: number, save: number) {
    const sql = `
      UPDATE allocation_rules
      SET spend_percentage = $1, save_percentage = $2, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $3
      RETURNING *;
    `;
    try {
      const result = await pool.query(sql, [spend, save, userId]);
      return result.rows[0];
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - updateRules]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  // PHASE 1: create the pending row (and enforce the pending limit) BEFORE touching Flutterwave.
  // PHASE 2: ask Flutterwave to send the PIN prompt.
  // Business outcomes are returned, real faults are logged raw and thrown.
  async triggerMoMoDeposit(
    userId: string,
    email: string | null,
    phone: string,
    amount: number,
  ) {
    const txRef = `mastersave-dep-${crypto.randomUUID()}`;
    const cleanPhone = phone.replace("+", "");

    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - triggerMoMoDeposit / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      // Lock this user's wallet row so two taps at the same moment cannot both pass the limit below
      const walletLockRes = await client.query(
        "SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      if (walletLockRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      const pendingCountRes = await client.query(
        `
        SELECT COUNT(*)::int AS pending_count
        FROM transactions
        WHERE user_id = $1
          AND type = 'deposit'
          AND status = 'pending'
          AND created_at > CURRENT_TIMESTAMP - INTERVAL '10 minutes';
      `,
        [userId],
      );
      if (pendingCountRes.rows[0].pending_count >= 2) {
        await client.query("ROLLBACK");
        return { outcome: "TOO_MANY_PENDING_DEPOSITS" as const };
      }

      await client.query(
        `
        INSERT INTO transactions (user_id, type, bucket, amount, status, tx_ref)
        VALUES ($1, 'deposit', 'split', $2, 'pending', $3);
      `,
        [userId, amount, txRef],
      );

      await client.query("COMMIT");
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - triggerMoMoDeposit / create pending row]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - triggerMoMoDeposit / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }

    // PHASE 2: the pending row exists, now it is safe to ask Flutterwave for the prompt
    let flutterwaveBody: any;
    try {
      const flutterwaveResponse = await axios.post(
        "https://api.flutterwave.com/v3/charges?type=mobile_money_rwanda",
        {
          tx_ref: txRef,
          amount: amount,
          currency: "RWF",
          email: email || "student@mastersave.app",
          phone_number: cleanPhone,
        },
        {
          headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}` },
          timeout: 20000,
        },
      );
      flutterwaveBody = flutterwaveResponse.data;
    } catch (flutterwaveError) {
      // We log message, status, response body and stack. We NEVER log axiosError.config,
      // because it contains the Authorization header with the secret key.
      const axiosError = flutterwaveError as any;
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - triggerMoMoDeposit / Flutterwave charge]: ${axiosError.message}\nCode: ${axiosError.code}\nHTTP status: ${axiosError.response?.status}\nResponse body: ${JSON.stringify(axiosError.response?.data)}\ntxRef: ${txRef}\nStack: ${axiosError.stack}\n`,
      );

      const httpStatus = axiosError.response?.status;
      if (
        typeof httpStatus === "number" &&
        httpStatus >= 400 &&
        httpStatus < 500
      ) {
        // Flutterwave answered and refused: this charge does not exist, so mark our row failed
        try {
          await pool.query(
            "UPDATE transactions SET status = 'failed' WHERE tx_ref = $1 AND status = 'pending'",
            [txRef],
          );
        } catch (markFailedError) {
          process.stderr.write(
            `[FINANCE_SERVICE FATAL ERROR - triggerMoMoDeposit / mark failed]: ${(markFailedError as Error).message}\nStack: ${(markFailedError as Error).stack}\ntxRef: ${txRef}\n`,
          );
        }
        return {
          outcome: "PROVIDER_REJECTED" as const,
          txRef,
          providerMessage:
            (axiosError.response?.data?.message as string) || null,
        };
      }

      // Timeout, network drop or a 5xx: we do NOT know whether the prompt was sent.
      // The row stays pending so the webhook can still credit it if the payment went through.
      return { outcome: "PROVIDER_UNREACHABLE" as const, txRef };
    }

    return {
      outcome: "PROMPT_SENT" as const,
      txRef,
      flutterwave: flutterwaveBody,
    };
  },

  // Called by the webhook. We never trust the webhook body for money:
  // we ask Flutterwave directly, then credit the amount WE stored when the deposit started.
  async finalizeDepositSplit(txRef: string, providerTransactionId: string) {
    // STEP 1: verify the payment with Flutterwave (outside the database transaction)
    let verifiedBody: any;
    try {
      const verifyResponse = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(providerTransactionId)}/verify`,
        {
          headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}` },
          timeout: 15000,
        },
      );
      verifiedBody = verifyResponse.data;
    } catch (verifyError) {
      const axiosError = verifyError as any;
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - finalizeDepositSplit / Flutterwave verify]: ${axiosError.message}\nCode: ${axiosError.code}\nHTTP status: ${axiosError.response?.status}\nResponse body: ${JSON.stringify(axiosError.response?.data)}\ntxRef: ${txRef}\nStack: ${axiosError.stack}\n`,
      );
      throw verifyError;
    }

    if (
      verifiedBody?.status !== "success" ||
      verifiedBody?.data?.status !== "successful"
    ) {
      process.stderr.write(
        `[SECURITY] finalizeDepositSplit: webhook claimed success but Flutterwave verify disagrees. txRef=${txRef} verifyBody=${JSON.stringify(verifiedBody)}\n`,
      );
      return { outcome: "NOT_VERIFIED" as const };
    }

    if (verifiedBody.data.tx_ref !== txRef) {
      process.stderr.write(
        `[SECURITY] finalizeDepositSplit: verified tx_ref does not match. webhookTxRef=${txRef} verifiedTxRef=${verifiedBody.data.tx_ref}\n`,
      );
      return { outcome: "REFERENCE_MISMATCH" as const };
    }

    if (verifiedBody.data.currency !== "RWF") {
      process.stderr.write(
        `[SECURITY] finalizeDepositSplit: unexpected currency. txRef=${txRef} currency=${verifiedBody.data.currency}\n`,
      );
      return { outcome: "CURRENCY_MISMATCH" as const };
    }

    const verifiedAmount = Number(verifiedBody.data.amount);

    // STEP 2: credit the wallet in ONE database transaction
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - finalizeDepositSplit / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      // FOR UPDATE: if the same webhook arrives twice at once, the second waits here,
      // then sees "completed" and does nothing
      const txRes = await client.query(
        `
        SELECT id, user_id, amount, status
        FROM transactions
        WHERE tx_ref = $1 AND type = 'deposit'
        FOR UPDATE;
      `,
        [txRef],
      );

      if (txRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "NOT_FOUND" as const };
      }

      const depositRow = txRes.rows[0];
      const userId = depositRow.user_id as string;

      if (depositRow.status === "completed") {
        await client.query("ROLLBACK");
        return { outcome: "ALREADY_COMPLETED" as const };
      }

      // Flutterwave's rule: the amount paid must be greater than or equal to the amount we expect.
      // Less than expected: never credit. More than expected: credit only the amount WE stored.
      if (verifiedAmount < Number(depositRow.amount)) {
        await client.query("ROLLBACK");
        process.stderr.write(
          `[SECURITY] finalizeDepositSplit: paid LESS than expected, NOT credited. txRef=${txRef} storedAmount=${depositRow.amount} verifiedAmount=${verifiedAmount}\n`,
        );
        return { outcome: "AMOUNT_MISMATCH" as const };
      }

      if (verifiedAmount > Number(depositRow.amount)) {
        process.stderr.write(
          `[FINANCE_SERVICE WARNING - finalizeDepositSplit]: paid MORE than expected. Crediting only the stored amount. The difference must be refunded manually. txRef=${txRef} storedAmount=${depositRow.amount} verifiedAmount=${verifiedAmount}\n`,
        );
      }

      if (depositRow.status === "failed") {
        // Flutterwave says the money arrived, so the provider wins over our earlier guess
        process.stderr.write(
          `[FINANCE_SERVICE WARNING - finalizeDepositSplit]: crediting a deposit we had marked failed because Flutterwave verified it. txRef=${txRef}\n`,
        );
      }

      // Lock the wallet row first. Every goal operation takes this same lock, so a deposit
      // and a goal change for the same student never run at the same time.
      const walletLockRes = await client.query(
        "SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      if (walletLockRes.rows.length === 0) {
        throw new Error(`NO_WALLET_FOR_USER userId=${userId} txRef=${txRef}`);
      }

      // Step 1: spend cut and save cut with exact NUMERIC math. The remainder goes to the save side.
      const cutsRes = await client.query(
        `
        SELECT
          ROUND($1::numeric * spend_percentage / 100, 2) AS spend_cut,
          $1::numeric - ROUND($1::numeric * spend_percentage / 100, 2) AS save_cut
        FROM allocation_rules
        WHERE user_id = $2;
      `,
        [depositRow.amount, userId],
      );

      if (cutsRes.rows.length === 0) {
        throw new Error(
          `NO_ALLOCATION_RULES_FOR_USER userId=${userId} txRef=${txRef}`,
        );
      }

      // Everything below is counted in whole cents (integers), so nothing is lost to rounding
      const spendCutCents = Math.round(Number(cutsRes.rows[0].spend_cut) * 100);
      let remainingSaveCents = Math.round(
        Number(cutsRes.rows[0].save_cut) * 100,
      );

      // Step 2: the save cut fills the active goals, oldest first, each up to its target
      const goalsRes = await client.query(
        `
        SELECT id, target_amount, saved_amount
        FROM savings_goals
        WHERE user_id = $1 AND status = 'active'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE;
      `,
        [userId],
      );

      let placedInGoalsCents = 0;
      for (const goal of goalsRes.rows) {
        if (remainingSaveCents <= 0) break;

        const roomCents =
          Math.round(Number(goal.target_amount) * 100) -
          Math.round(Number(goal.saved_amount) * 100);
        if (roomCents <= 0) continue;

        const addCents = Math.min(roomCents, remainingSaveCents);

        await client.query(
          `
          UPDATE savings_goals
          SET saved_amount = saved_amount + $1::numeric,
            reached_target_at = CASE
              WHEN reached_target_at IS NULL AND saved_amount + $1::numeric >= target_amount
              THEN CURRENT_TIMESTAMP
              ELSE reached_target_at
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2;
        `,
          [(addCents / 100).toFixed(2), goal.id],
        );

        placedInGoalsCents += addCents;
        remainingSaveCents -= addCents;
      }

      // Step 3: whatever the goals could not take (or all of it, with no goals) goes to undecided
      const undecidedCents = remainingSaveCents;

      await client.query(
        `
        UPDATE wallets
        SET spend_balance = spend_balance + $1::numeric,
          undecided_balance = undecided_balance + $2::numeric,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $3;
      `,
        [
          (spendCutCents / 100).toFixed(2),
          (undecidedCents / 100).toFixed(2),
          userId,
        ],
      );

      await client.query(
        `
        UPDATE transactions
        SET status = 'completed',
          spend_amount = $1::numeric,
          save_amount = $2::numeric,
          undecided_amount = $3::numeric
        WHERE id = $4;
      `,
        [
          (spendCutCents / 100).toFixed(2),
          (placedInGoalsCents / 100).toFixed(2),
          (undecidedCents / 100).toFixed(2),
          depositRow.id,
        ],
      );

      await client.query("COMMIT");

      return {
        outcome: "CREDITED" as const,
        userId,
        spendAmount: spendCutCents / 100,
        saveAmount: placedInGoalsCents / 100,
        undecidedAmount: undecidedCents / 100,
      };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - finalizeDepositSplit / credit]: ${(error as Error).message}\nStack: ${(error as Error).stack}\ntxRef: ${txRef}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - finalizeDepositSplit / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },

  // Called by the webhook when Flutterwave reports a failed charge
  async markDepositFailed(txRef: string) {
    const sql = `
      UPDATE transactions
      SET status = 'failed'
      WHERE tx_ref = $1 AND type = 'deposit' AND status = 'pending'
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [txRef]);
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - markDepositFailed]: ${(error as Error).message}\nStack: ${(error as Error).stack}\ntxRef: ${txRef}\n`,
      );
      throw error;
    }
  },

  // Reconciliation: finds deposits that are still "pending" after 10 minutes and asks
  // Flutterwave what really happened. This catches the dangerous case where a student PAID
  // but our webhook never arrived (server down, network drop, wrong secret hash).
  // Called by the background worker every 5 minutes.
  async reconcileStalePendingDeposits() {
    const summary = {
      checked: 0,
      credited: 0,
      markedFailed: 0,
      stillPending: 0,
      stoppedEarly: false,
    };

    let staleRows: any[] = [];
    try {
      const staleRes = await pool.query(`
        SELECT tx_ref, created_at
        FROM transactions
        WHERE type = 'deposit'
          AND status = 'pending'
          AND created_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
        ORDER BY created_at ASC
        LIMIT 10;
      `);
      staleRows = staleRes.rows;
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - reconcileStalePendingDeposits / find stale rows]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }

    for (const staleRow of staleRows) {
      const txRef = staleRow.tx_ref as string;
      const ageMinutes =
        (Date.now() - new Date(staleRow.created_at).getTime()) / 60000;
      summary.checked++;

      let providerBody: any = null;

      try {
        const lookupResponse = await axios.get(
          `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
          {
            headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}` },
            timeout: 15000,
          },
        );
        providerBody = lookupResponse.data;
      } catch (lookupError) {
        // We log message, status, response body and stack. NEVER axiosError.config (it holds the secret key).
        const axiosError = lookupError as any;
        const lookupHttpStatus = axiosError.response?.status;
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - reconcileStalePendingDeposits / Flutterwave lookup]: ${axiosError.message}\nCode: ${axiosError.code}\nHTTP status: ${lookupHttpStatus}\nResponse body: ${JSON.stringify(axiosError.response?.data)}\ntxRef: ${txRef}\nStack: ${axiosError.stack}\n`,
        );

        // Network drop, timeout, bad key, rate limit or Flutterwave outage:
        // the answer would be the same for the next rows, so stop and retry next cycle.
        const providerOrNetworkProblem =
          typeof lookupHttpStatus !== "number" ||
          lookupHttpStatus === 401 ||
          lookupHttpStatus === 403 ||
          lookupHttpStatus === 429 ||
          lookupHttpStatus >= 500;

        if (providerOrNetworkProblem) {
          summary.stoppedEarly = true;
          break;
        }

        // Any other 4xx means Flutterwave has no record under this reference
        providerBody = null;
      }

      const providerStatus: string | null = providerBody?.data?.status ?? null;

      // CASE 1: the student paid but we never heard about it. Credit through the SAME
      // path the webhook uses (it verifies again and locks the row, so it can never double credit).
      if (providerStatus === "successful") {
        try {
          const finalizeResult = await financeService.finalizeDepositSplit(
            txRef,
            String(providerBody.data.id),
          );
          if (finalizeResult.outcome === "CREDITED") {
            summary.credited++;
          }
          process.stdout.write(
            `[RECONCILE] txRef=${txRef} finalize outcome=${finalizeResult.outcome}\n`,
          );
        } catch (finalizeError) {
          process.stderr.write(
            `[FINANCE_SERVICE FATAL ERROR - reconcileStalePendingDeposits / finalize]: ${(finalizeError as Error).message}\nStack: ${(finalizeError as Error).stack}\ntxRef: ${txRef}\n`,
          );
        }
        continue;
      }

      // CASE 2 and 3: decide whether the deposit is dead
      let shouldMarkFailed = false;
      let failedReason = "";

      if (providerStatus === "failed") {
        shouldMarkFailed = true;
        failedReason = "Flutterwave reports the charge failed";
      } else if (providerStatus === null && ageMinutes >= 30) {
        shouldMarkFailed = true;
        failedReason =
          "Flutterwave has no record of this charge after 30 minutes";
      } else if (providerStatus === "pending" && ageMinutes >= 120) {
        shouldMarkFailed = true;
        failedReason = "still pending at Flutterwave after 2 hours";
      }

      if (!shouldMarkFailed) {
        summary.stillPending++;
        continue;
      }

      try {
        await financeService.markDepositFailed(txRef);
        summary.markedFailed++;
        process.stdout.write(
          `[RECONCILE] txRef=${txRef} marked failed. reason=${failedReason}\n`,
        );
      } catch (markFailedError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - reconcileStalePendingDeposits / mark failed]: ${(markFailedError as Error).message}\nStack: ${(markFailedError as Error).stack}\ntxRef: ${txRef}\n`,
        );
      }
    }

    return summary;
  },

  // The app polls this after a deposit prompt, so it knows when the split has landed
  async getDepositStatus(userId: string, txRef: string) {
    const sql = `
      SELECT tx_ref, status, amount, spend_amount, save_amount, undecided_amount, created_at
      FROM transactions
      WHERE tx_ref = $1 AND user_id = $2 AND type = 'deposit';
    `;
    try {
      const result = await pool.query(sql, [txRef, userId]);
      return result.rows[0];
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - getDepositStatus]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  // Transaction history, newest first. "before" lets the app load older pages.
  async getTransactionHistory(
    userId: string,
    limit: number,
    before: string | null,
  ) {
    const sql = `
      SELECT id, type, bucket, goal_id, amount, penalty_amount, status, tx_ref,
             spend_amount, save_amount, undecided_amount, created_at
      FROM transactions
      WHERE user_id = $1
        AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
      ORDER BY created_at DESC
      LIMIT $3;
    `;
    try {
      const result = await pool.query(sql, [userId, before, limit]);
      return result.rows;
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - getTransactionHistory]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  // WITHDRAWALS (simulated payouts). All three follow the same steps inside ONE transaction:
  // 1. lock the wallet row   2. replay protection (idempotency key)   3. check funds
  // 4. update the wallet   5. write the ledger row (penalty included)

  async simulateSpendWithdrawal(
    userId: string,
    amount: number,
    idempotencyKey: string,
  ) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - simulateSpendWithdrawal / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      // The lock makes two requests from the same user run one after the other
      const walletRes = await client.query(
        `
        SELECT (spend_balance >= $2::numeric) AS covers_amount
        FROM wallets
        WHERE user_id = $1
        FOR UPDATE;
      `,
        [userId, amount],
      );

      if (walletRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      // Replay protection comes BEFORE the funds check, so a retried request that already
      // succeeded is answered as a duplicate even if the balance is lower now
      const existingRes = await client.query(
        `
        SELECT type, bucket, amount
        FROM transactions
        WHERE user_id = $1 AND idempotency_key = $2;
      `,
        [userId, idempotencyKey],
      );

      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        await client.query("ROLLBACK");
        if (
          existing.type === "withdraw" &&
          existing.bucket === "spend" &&
          Number(existing.amount) === amount
        ) {
          return {
            outcome: "DUPLICATE_REQUEST" as const,
            requestedAmount: amount,
          };
        }
        return { outcome: "IDEMPOTENCY_KEY_REUSED" as const };
      }

      if (walletRes.rows[0].covers_amount !== true) {
        await client.query("ROLLBACK");
        return { outcome: "INSUFFICIENT_FUNDS" as const };
      }

      await client.query(
        `
        UPDATE wallets
        SET spend_balance = spend_balance - $1::numeric, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2;
      `,
        [amount, userId],
      );

      await client.query(
        `
        INSERT INTO transactions (user_id, type, bucket, amount, status, idempotency_key)
        VALUES ($1, 'withdraw', 'spend', $2::numeric, 'completed', $3);
      `,
        [userId, amount, idempotencyKey],
      );

      await client.query("COMMIT");
      return { outcome: "WITHDRAWN" as const, requestedAmount: amount };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - simulateSpendWithdrawal]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - simulateSpendWithdrawal / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },

  // ==========================================================================
  // SAVINGS GOALS
  // Every method below locks the student's wallet row FIRST. That makes all goal
  // operations for one student run one after the other (no double spending, no 4th goal by accident).
  // ==========================================================================

  async createGoal(
    userId: string,
    name: string,
    targetAmount: number,
    unlockDate: string,
  ) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - createGoal / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      const walletLockRes = await client.query(
        "SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      if (walletLockRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      const activeCountRes = await client.query(
        "SELECT COUNT(*)::int AS active_count FROM savings_goals WHERE user_id = $1 AND status = 'active'",
        [userId],
      );
      if (activeCountRes.rows[0].active_count >= 3) {
        await client.query("ROLLBACK");
        return { outcome: "MAX_ACTIVE_GOALS_REACHED" as const };
      }

      const insertRes = await client.query(
        `
        INSERT INTO savings_goals (user_id, name, target_amount, unlock_date)
        VALUES ($1, $2, $3::numeric, $4::timestamptz)
        RETURNING id, name, target_amount, saved_amount, reserved_amount, unlock_date, status, created_at;
      `,
        [userId, name, targetAmount, unlockDate],
      );

      await client.query("COMMIT");
      return { outcome: "CREATED" as const, goal: insertRes.rows[0] };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - createGoal]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - createGoal / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },

  async getGoals(userId: string) {
    try {
      const goalsRes = await pool.query(
        `
        SELECT
          id, name, target_amount, saved_amount, reserved_amount,
          (saved_amount - reserved_amount) AS available_amount,
          unlock_date, reached_target_at, status,
          (CURRENT_TIMESTAMP >= unlock_date OR reached_target_at IS NOT NULL) AS is_unlocked,
          created_at
        FROM savings_goals
        WHERE user_id = $1 AND status = 'active'
        ORDER BY created_at ASC, id ASC;
      `,
        [userId],
      );

      const requestsRes = await pool.query(
        `
        SELECT id, goal_id, amount, status, ready_at, created_at,
          (CURRENT_TIMESTAMP >= ready_at) AS is_ready
        FROM withdrawal_requests
        WHERE user_id = $1 AND status = 'pending'
        ORDER BY ready_at ASC;
      `,
        [userId],
      );

      return {
        goals: goalsRes.rows,
        withdrawalRequests: requestsRes.rows,
      };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - getGoals]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async renameGoal(userId: string, goalId: string, name: string) {
    const sql = `
      UPDATE savings_goals
      SET name = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_id = $3 AND status = 'active'
      RETURNING id, name, target_amount, saved_amount, reserved_amount, unlock_date, status, created_at;
    `;
    try {
      const result = await pool.query(sql, [name, goalId, userId]);
      if (result.rows.length === 0) {
        return { outcome: "GOAL_NOT_FOUND" as const };
      }
      return { outcome: "RENAMED" as const, goal: result.rows[0] };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - renameGoal]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId} goalId=${goalId}\n`,
      );
      throw error;
    }
  },

  // Deleting is only allowed for an EMPTY goal. A goal with money inside must be withdrawn first,
  // otherwise deleting would be a way around the lock. The goal is closed, never erased,
  // so the ledger history keeps pointing at it.
  async deleteGoal(userId: string, goalId: string) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - deleteGoal / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      // Same rule as every other goal operation: the wallet row is locked first
      const walletLockRes = await client.query(
        "SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      if (walletLockRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      const goalRes = await client.query(
        `
        SELECT
          saved_amount,
          (saved_amount > 0) AS has_funds,
          (reserved_amount > 0) AS has_pending_withdrawals,
          (CURRENT_TIMESTAMP >= unlock_date OR reached_target_at IS NOT NULL) AS is_unlocked
        FROM savings_goals
        WHERE id = $1 AND user_id = $2 AND status = 'active'
        FOR UPDATE;
      `,
        [goalId, userId],
      );

      if (goalRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "GOAL_NOT_FOUND" as const };
      }

      const goal = goalRes.rows[0];

      if (goal.has_funds === true) {
        await client.query("ROLLBACK");
        return {
          outcome: "GOAL_HAS_FUNDS" as const,
          savedAmount: Number(goal.saved_amount),
          hasPendingWithdrawals: goal.has_pending_withdrawals === true,
          isUnlocked: goal.is_unlocked === true,
        };
      }

      await client.query(
        `
        UPDATE savings_goals
        SET status = 'closed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
      `,
        [goalId],
      );

      await client.query("COMMIT");
      return { outcome: "DELETED" as const };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - deleteGoal]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId} goalId=${goalId}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - deleteGoal / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },

  // Withdraw from a goal. Unlocked goal: free. Locked goal: refused with GOAL_LOCKED (the friction)
  // unless the student agreed to the 5% penalty. The penalty is deducted ON TOP of the amount.
  async withdrawFromGoal(
    userId: string,
    goalId: string,
    amount: number,
    idempotencyKey: string,
    agreeToPenalty: boolean,
  ) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - withdrawFromGoal / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      const walletLockRes = await client.query(
        "SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      if (walletLockRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      const existingRes = await client.query(
        `
        SELECT type, bucket, goal_id, amount, penalty_amount, (amount + penalty_amount) AS total_deducted
        FROM transactions
        WHERE user_id = $1 AND idempotency_key = $2;
      `,
        [userId, idempotencyKey],
      );

      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        await client.query("ROLLBACK");
        if (
          existing.type === "withdraw" &&
          existing.bucket === "save" &&
          existing.goal_id === goalId &&
          Number(existing.amount) === amount
        ) {
          return {
            outcome: "DUPLICATE_REQUEST" as const,
            requestedAmount: amount,
            penaltyAmount: Number(existing.penalty_amount),
            totalDeducted: Number(existing.total_deducted),
            penaltyApplied: Number(existing.penalty_amount) > 0,
            goalClosed: false,
          };
        }
        return { outcome: "IDEMPOTENCY_KEY_REUSED" as const };
      }

      const goalRes = await client.query(
        `
        SELECT
          (CURRENT_TIMESTAMP >= unlock_date OR reached_target_at IS NOT NULL) AS is_unlocked,
          unlock_date,
          (saved_amount - reserved_amount) AS available_amount,
          ((saved_amount - reserved_amount) >= $3::numeric) AS covers_amount,
          ((saved_amount - reserved_amount) >= $3::numeric + ROUND($3::numeric * 0.05, 2)) AS covers_amount_and_penalty,
          $3::numeric AS requested_amount,
          ROUND($3::numeric * 0.05, 2) AS penalty_amount,
          ($3::numeric + ROUND($3::numeric * 0.05, 2)) AS total_deduction
        FROM savings_goals
        WHERE id = $1 AND user_id = $2 AND status = 'active'
        FOR UPDATE;
      `,
        [goalId, userId, amount],
      );

      if (goalRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "GOAL_NOT_FOUND" as const };
      }

      const goal = goalRes.rows[0];
      const isUnlocked = goal.is_unlocked === true;

      // THE IMPULSE BLOCKER: a locked goal is not withdrawn instantly without the student agreeing to the penalty
      if (!isUnlocked && agreeToPenalty !== true) {
        await client.query("ROLLBACK");
        return {
          outcome: "GOAL_LOCKED" as const,
          unlockDate: goal.unlock_date,
          availableAmount: goal.available_amount,
        };
      }

      if (goal.covers_amount !== true) {
        await client.query("ROLLBACK");
        return { outcome: "INSUFFICIENT_FUNDS" as const };
      }

      const applyPenalty = !isUnlocked;
      if (applyPenalty && goal.covers_amount_and_penalty !== true) {
        await client.query("ROLLBACK");
        return { outcome: "INSUFFICIENT_FUNDS_FOR_PENALTY" as const };
      }

      const penaltyAmountText = applyPenalty ? goal.penalty_amount : "0.00";
      const totalDeductionText = applyPenalty
        ? goal.total_deduction
        : goal.requested_amount;

      // A goal that was drained while unlocked is finished, so it closes and frees its slot
      const goalUpdateRes = await client.query(
        `
        UPDATE savings_goals
        SET saved_amount = saved_amount - $1::numeric,
          status = CASE WHEN saved_amount - $1::numeric = 0 AND $3::boolean THEN 'closed' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING status;
      `,
        [totalDeductionText, goalId, isUnlocked],
      );

      await client.query(
        `
        INSERT INTO transactions (user_id, type, bucket, goal_id, amount, penalty_amount, status, idempotency_key)
        VALUES ($1, 'withdraw', 'save', $2, $3::numeric, $4::numeric, 'completed', $5);
      `,
        [userId, goalId, amount, penaltyAmountText, idempotencyKey],
      );

      await client.query("COMMIT");
      return {
        outcome: "WITHDRAWN" as const,
        requestedAmount: amount,
        penaltyAmount: Number(penaltyAmountText),
        totalDeducted: Number(totalDeductionText),
        penaltyApplied: applyPenalty,
        goalClosed: goalUpdateRes.rows[0].status === "closed",
      };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - withdrawFromGoal]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId} goalId=${goalId}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - withdrawFromGoal / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },

  // The cooldown option: the amount is reserved on the goal now and can be claimed after the wait
  async createWithdrawalRequest(
    userId: string,
    goalId: string,
    amount: number,
    idempotencyKey: string,
  ) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - createWithdrawalRequest / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      const walletLockRes = await client.query(
        "SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      if (walletLockRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      const existingRes = await client.query(
        `
        SELECT id, goal_id, amount, status, ready_at, created_at
        FROM withdrawal_requests
        WHERE user_id = $1 AND idempotency_key = $2;
      `,
        [userId, idempotencyKey],
      );

      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        await client.query("ROLLBACK");
        if (existing.goal_id === goalId && Number(existing.amount) === amount) {
          return { outcome: "DUPLICATE_REQUEST" as const, request: existing };
        }
        return { outcome: "IDEMPOTENCY_KEY_REUSED" as const };
      }

      const goalRes = await client.query(
        `
        SELECT
          (CURRENT_TIMESTAMP >= unlock_date OR reached_target_at IS NOT NULL) AS is_unlocked,
          ((saved_amount - reserved_amount) >= $3::numeric) AS covers_amount
        FROM savings_goals
        WHERE id = $1 AND user_id = $2 AND status = 'active'
        FOR UPDATE;
      `,
        [goalId, userId, amount],
      );

      if (goalRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "GOAL_NOT_FOUND" as const };
      }

      if (goalRes.rows[0].is_unlocked === true) {
        await client.query("ROLLBACK");
        return { outcome: "GOAL_ALREADY_UNLOCKED" as const };
      }

      if (goalRes.rows[0].covers_amount !== true) {
        await client.query("ROLLBACK");
        return { outcome: "INSUFFICIENT_FUNDS" as const };
      }

      await client.query(
        `
        UPDATE savings_goals
        SET reserved_amount = reserved_amount + $1::numeric, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `,
        [amount, goalId],
      );

      const requestRes = await client.query(
        `
        INSERT INTO withdrawal_requests (user_id, goal_id, amount, ready_at, idempotency_key)
        VALUES ($1, $2, $3::numeric, CURRENT_TIMESTAMP + make_interval(mins => $4::int), $5)
        RETURNING id, goal_id, amount, status, ready_at, created_at;
      `,
        [userId, goalId, amount, WITHDRAWAL_COOLDOWN_MINUTES, idempotencyKey],
      );

      await client.query("COMMIT");
      return { outcome: "CREATED" as const, request: requestRes.rows[0] };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - createWithdrawalRequest]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId} goalId=${goalId}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - createWithdrawalRequest / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },

  // After the cooldown the money leaves the goal (simulated payout), with no penalty
  async claimWithdrawalRequest(userId: string, requestId: string) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - claimWithdrawalRequest / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      const walletLockRes = await client.query(
        "SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      if (walletLockRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      const requestRes = await client.query(
        `
        SELECT id, goal_id, amount, status, ready_at, (CURRENT_TIMESTAMP >= ready_at) AS is_ready
        FROM withdrawal_requests
        WHERE id = $1 AND user_id = $2
        FOR UPDATE;
      `,
        [requestId, userId],
      );

      if (requestRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "REQUEST_NOT_FOUND" as const };
      }

      const request = requestRes.rows[0];

      if (request.status === "claimed") {
        await client.query("ROLLBACK");
        return {
          outcome: "ALREADY_CLAIMED" as const,
          requestedAmount: Number(request.amount),
        };
      }

      if (request.status === "cancelled") {
        await client.query("ROLLBACK");
        return { outcome: "REQUEST_CANCELLED" as const };
      }

      if (request.is_ready !== true) {
        await client.query("ROLLBACK");
        return { outcome: "NOT_READY" as const, readyAt: request.ready_at };
      }

      const goalRes = await client.query(
        `
        SELECT (CURRENT_TIMESTAMP >= unlock_date OR reached_target_at IS NOT NULL) AS is_unlocked
        FROM savings_goals
        WHERE id = $1 AND user_id = $2
        FOR UPDATE;
      `,
        [request.goal_id, userId],
      );

      if (goalRes.rows.length === 0) {
        throw new Error(
          `GOAL_MISSING_FOR_REQUEST requestId=${requestId} goalId=${request.goal_id}`,
        );
      }

      const goalUpdateRes = await client.query(
        `
        UPDATE savings_goals
        SET saved_amount = saved_amount - $1::numeric,
          reserved_amount = reserved_amount - $1::numeric,
          status = CASE WHEN saved_amount - $1::numeric = 0 AND $3::boolean THEN 'closed' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING status;
      `,
        [request.amount, request.goal_id, goalRes.rows[0].is_unlocked === true],
      );

      await client.query(
        `
        INSERT INTO transactions (user_id, type, bucket, goal_id, amount, status)
        VALUES ($1, 'withdraw', 'save', $2, $3::numeric, 'completed');
      `,
        [userId, request.goal_id, request.amount],
      );

      await client.query(
        "UPDATE withdrawal_requests SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP WHERE id = $1",
        [requestId],
      );

      await client.query("COMMIT");
      return {
        outcome: "CLAIMED" as const,
        requestedAmount: Number(request.amount),
        goalClosed: goalUpdateRes.rows[0].status === "closed",
      };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - claimWithdrawalRequest]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId} requestId=${requestId}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - claimWithdrawalRequest / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },

  // The student changed their mind during the cooldown: the reserved money is released
  async cancelWithdrawalRequest(userId: string, requestId: string) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - cancelWithdrawalRequest / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      const walletLockRes = await client.query(
        "SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      if (walletLockRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      const requestRes = await client.query(
        `
        SELECT id, goal_id, amount, status
        FROM withdrawal_requests
        WHERE id = $1 AND user_id = $2
        FOR UPDATE;
      `,
        [requestId, userId],
      );

      if (requestRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "REQUEST_NOT_FOUND" as const };
      }

      const request = requestRes.rows[0];

      if (request.status === "claimed") {
        await client.query("ROLLBACK");
        return { outcome: "ALREADY_CLAIMED" as const };
      }

      if (request.status === "cancelled") {
        await client.query("ROLLBACK");
        return { outcome: "ALREADY_CANCELLED" as const };
      }

      await client.query(
        `
        UPDATE savings_goals
        SET reserved_amount = reserved_amount - $1::numeric, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND user_id = $3;
      `,
        [request.amount, request.goal_id, userId],
      );

      await client.query(
        "UPDATE withdrawal_requests SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = $1",
        [requestId],
      );

      await client.query("COMMIT");
      return { outcome: "CANCELLED" as const };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - cancelWithdrawalRequest]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId} requestId=${requestId}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - cancelWithdrawalRequest / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },

  // Undecided money goes to Spend (goalId = null) or into a goal. Total money never changes.
  async moveUndecided(
    userId: string,
    amount: number,
    goalId: string | null,
    idempotencyKey: string,
  ) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - moveUndecided / pool.connect]: ${(connectError as Error).message}\nStack: ${(connectError as Error).stack}\n`,
      );
      throw connectError;
    }

    let rollbackFailed = false;
    try {
      await client.query("BEGIN");

      const walletRes = await client.query(
        `
        SELECT (undecided_balance >= $2::numeric) AS covers_amount
        FROM wallets
        WHERE user_id = $1
        FOR UPDATE;
      `,
        [userId, amount],
      );

      if (walletRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { outcome: "WALLET_NOT_FOUND" as const };
      }

      const existingRes = await client.query(
        `
        SELECT type, goal_id, amount
        FROM transactions
        WHERE user_id = $1 AND idempotency_key = $2;
      `,
        [userId, idempotencyKey],
      );

      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        await client.query("ROLLBACK");
        if (
          existing.type === "transfer" &&
          (existing.goal_id ?? null) === goalId &&
          Number(existing.amount) === amount
        ) {
          return {
            outcome: "DUPLICATE_REQUEST" as const,
            movedAmount: amount,
          };
        }
        return { outcome: "IDEMPOTENCY_KEY_REUSED" as const };
      }

      if (walletRes.rows[0].covers_amount !== true) {
        await client.query("ROLLBACK");
        return { outcome: "INSUFFICIENT_UNDECIDED_FUNDS" as const };
      }

      if (goalId === null) {
        await client.query(
          `
          UPDATE wallets
          SET undecided_balance = undecided_balance - $1::numeric,
            spend_balance = spend_balance + $1::numeric,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $2;
        `,
          [amount, userId],
        );
      } else {
        const goalRes = await client.query(
          `
          SELECT
            (target_amount - saved_amount) AS room_amount,
            ((target_amount - saved_amount) >= $3::numeric) AS fits
          FROM savings_goals
          WHERE id = $1 AND user_id = $2 AND status = 'active'
          FOR UPDATE;
        `,
          [goalId, userId, amount],
        );

        if (goalRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return { outcome: "GOAL_NOT_FOUND" as const };
        }

        if (goalRes.rows[0].fits !== true) {
          await client.query("ROLLBACK");
          return {
            outcome: "GOAL_ROOM_EXCEEDED" as const,
            roomAmount: Number(goalRes.rows[0].room_amount),
          };
        }

        await client.query(
          `
          UPDATE savings_goals
          SET saved_amount = saved_amount + $1::numeric,
            reached_target_at = CASE
              WHEN reached_target_at IS NULL AND saved_amount + $1::numeric >= target_amount
              THEN CURRENT_TIMESTAMP
              ELSE reached_target_at
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2;
        `,
          [amount, goalId],
        );

        await client.query(
          `
          UPDATE wallets
          SET undecided_balance = undecided_balance - $1::numeric, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $2;
        `,
          [amount, userId],
        );
      }

      await client.query(
        `
        INSERT INTO transactions (user_id, type, bucket, goal_id, amount, status, idempotency_key)
        VALUES ($1, 'transfer', 'undecided', $2, $3::numeric, 'completed', $4);
      `,
        [userId, goalId, amount, idempotencyKey],
      );

      await client.query("COMMIT");
      return { outcome: "MOVED" as const, movedAmount: amount };
    } catch (error) {
      process.stderr.write(
        `[FINANCE_SERVICE FATAL ERROR - moveUndecided]: ${(error as Error).message}\nStack: ${(error as Error).stack}\nuserId=${userId}\n`,
      );
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        process.stderr.write(
          `[FINANCE_SERVICE FATAL ERROR - moveUndecided / ROLLBACK]: ${(rollbackError as Error).message}\nStack: ${(rollbackError as Error).stack}\n`,
        );
        rollbackFailed = true;
      }
      throw error;
    } finally {
      client.release(rollbackFailed ? true : undefined);
    }
  },
};

// src/features/finance/finance.controller.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "node:stream/consumers";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { financeService } from "./finance.service.js";
import { redisClient } from "../../db/redis.js";
import type { JWTPayload } from "../auth/auth.types.js";
import {
  ACCESS_TOKEN_SECRET,
  FLUTTERWAVE_WEBHOOK_HASH,
  NODE_ENV,
  WITHDRAWAL_COOLDOWN_MINUTES,
} from "../../config/env.js";

export const financeController = {
  async getDashboard(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[getDashboard] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    try {
      const dashboard = await financeService.getDashboard(decoded.id);
      if (!dashboard) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Wallet not found." }));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ dashboard }));
    } catch (err) {
      process.stderr.write(
        `[getDashboard] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your balances. Please try again.",
        }),
      );
    }
  },

  async updateRules(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[updateRules] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    let body: any;
    try {
      body = await json(req);
    } catch (err) {
      process.stderr.write(
        `[updateRules] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    const { spendPercentage, savePercentage } = body;

    if (
      !Number.isInteger(spendPercentage) ||
      !Number.isInteger(savePercentage) ||
      spendPercentage < 0 ||
      savePercentage < 0 ||
      spendPercentage > 100 ||
      savePercentage > 100
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Each percentage must be a whole number from 0 to 100.",
        }),
      );
      return;
    }

    if (spendPercentage + savePercentage !== 100) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Rules must equal 100%" }));
      return;
    }

    try {
      const updated = await financeService.updateRules(
        decoded.id,
        spendPercentage,
        savePercentage,
      );
      if (!updated) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Allocation rules not found." }));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Rules updated", rules: updated }));
    } catch (err) {
      process.stderr.write(
        `[updateRules] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't save your rules. Please try again.",
        }),
      );
    }
  },

  async triggerDeposit(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[triggerDeposit] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    let activeUser: any;
    try {
      activeUser = await financeService.getActiveUserForFinance(decoded.id);
    } catch (err) {
      process.stderr.write(
        `[triggerDeposit] DB Error loading the account: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your account. Please try again.",
        }),
      );
      return;
    }
    if (!activeUser) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Account not found. Please log in again.",
          code: "ACCOUNT_NOT_FOUND",
        }),
      );
      return;
    }

    let body: any;
    try {
      body = await json(req);
    } catch (err) {
      process.stderr.write(
        `[triggerDeposit] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    const amount = body.amount;
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 1000000
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Deposit must be a whole number of RWF between 100 and 1,000,000.",
        }),
      );
      return;
    }

    if (typeof body.phoneNumber !== "string") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Phone number is required." }));
      return;
    }

    let phoneNumber = body.phoneNumber.replace(/[\s-]/g, "");
    if (phoneNumber.startsWith("07")) {
      phoneNumber = "+250" + phoneNumber.substring(1);
    } else if (phoneNumber.startsWith("250")) {
      phoneNumber = "+" + phoneNumber;
    }
    if (!/^\+2507[2389]\d{7}$/.test(phoneNumber)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Please enter a valid Rwandan MTN or Airtel phone number.",
        }),
      );
      return;
    }

    // Per-user limit: 10 deposit attempts per hour. If Redis is down we still allow the request.
    if (NODE_ENV !== "development") {
      try {
        const depositLimitKey = `ratelimit:deposit:user:${decoded.id}`;
        const depositLimitResults = await redisClient
          .multi()
          .set(depositLimitKey, 0, { ex: 3600, nx: true })
          .incr(depositLimitKey)
          .exec();
        const depositAttempts = Number(depositLimitResults[1]);

        if (depositAttempts > 10) {
          res.statusCode = 429;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Too many deposit attempts. Please try again later.",
              code: "DEPOSIT_RATE_LIMITED",
            }),
          );
          return;
        }
      } catch (redisErr) {
        process.stderr.write(
          `[triggerDeposit] Rate limiter error, request allowed: ${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
        );
      }
    }

    try {
      // The email comes from the account in the database, never from the request body
      const result = await financeService.triggerMoMoDeposit(
        decoded.id,
        activeUser.email,
        phoneNumber,
        amount,
      );

      if (result.outcome === "WALLET_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Wallet not found." }));
        return;
      }

      if (result.outcome === "TOO_MANY_PENDING_DEPOSITS") {
        res.statusCode = 429;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "You already have deposits waiting for approval on your phone. Please finish them or wait a few minutes.",
            code: "TOO_MANY_PENDING_DEPOSITS",
          }),
        );
        return;
      }

      if (result.outcome === "PROVIDER_REJECTED") {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "The payment provider couldn't start this payment. Please check the phone number and try again.",
            code: "PAYMENT_PROVIDER_REJECTED",
          }),
        );
        return;
      }

      if (result.outcome === "PROVIDER_UNREACHABLE") {
        // We do not know whether the prompt was sent. The deposit stays pending and can still be credited.
        res.statusCode = 202;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            message:
              "We couldn't confirm the payment request. If you get a prompt on your phone, approve it and your balance will update shortly.",
            code: "DEPOSIT_STATUS_UNKNOWN",
            txRef: result.txRef,
          }),
        );
        return;
      }

      // PROMPT_SENT: pass on only what the app needs, never the raw provider payload
      const providerAuthorization = result.flutterwave?.meta?.authorization;
      let authorizationMode: string | null = null;
      let authorizationUrl: string | null = null;

      if (
        providerAuthorization &&
        typeof providerAuthorization.mode === "string"
      ) {
        authorizationMode = providerAuthorization.mode;
      }
      if (
        providerAuthorization &&
        typeof providerAuthorization.redirect === "string" &&
        providerAuthorization.redirect.startsWith("https://")
      ) {
        authorizationUrl = providerAuthorization.redirect;
      }

      // We log the mode but never the URL itself
      process.stdout.write(
        `[triggerDeposit] Prompt sent. txRef=${result.txRef} authorizationMode=${authorizationMode} hasRedirectUrl=${authorizationUrl !== null}\n`,
      );

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message: "Payment request sent to your phone.",
          txRef: result.txRef,
          authorizationMode,
          authorizationUrl,
        }),
      );
    } catch (err) {
      process.stderr.write(
        `[triggerDeposit] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't start your deposit. Please try again.",
        }),
      );
    }
  },

  async getDepositStatus(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[getDepositStatus] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://localhost");
    const txRef = parsedUrl.searchParams.get("txRef") || "";

    if (
      !/^mastersave-dep-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        txRef,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "A valid txRef is required." }));
      return;
    }

    try {
      const deposit = await financeService.getDepositStatus(decoded.id, txRef);
      if (!deposit) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Deposit not found." }));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ deposit }));
    } catch (err) {
      process.stderr.write(
        `[getDepositStatus] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't check your deposit. Please try again.",
        }),
      );
    }
  },

  async getTransactions(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[getTransactions] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://localhost");

    let limit = 20;
    const limitRaw = parsedUrl.searchParams.get("limit");
    if (limitRaw !== null) {
      const parsedLimit = Number.parseInt(limitRaw, 10);
      if (!Number.isNaN(parsedLimit)) {
        limit = Math.min(Math.max(parsedLimit, 1), 50);
      }
    }

    let before: string | null = null;
    const beforeRaw = parsedUrl.searchParams.get("before");
    if (beforeRaw !== null && beforeRaw.length > 0) {
      const beforeDate = new Date(beforeRaw);
      if (Number.isNaN(beforeDate.getTime())) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid 'before' date." }));
        return;
      }
      before = beforeDate.toISOString();
    }

    try {
      const transactions = await financeService.getTransactionHistory(
        decoded.id,
        limit,
        before,
      );
      const nextBefore =
        transactions.length === limit
          ? transactions[transactions.length - 1].created_at
          : null;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ transactions, nextBefore }));
    } catch (err) {
      process.stderr.write(
        `[getTransactions] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your history. Please try again.",
        }),
      );
    }
  },

  async flutterwaveWebhook(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // 1. Signature: Flutterwave sends our secret hash in the "verif-hash" header
    const signatureHeader = req.headers["verif-hash"];
    if (typeof signatureHeader !== "string" || signatureHeader.length === 0) {
      process.stderr.write(
        `[SECURITY] [flutterwaveWebhook] Missing or invalid verif-hash header.\n`,
      );
      res.statusCode = 401;
      res.end();
      return;
    }

    // Both sides are hashed first so the two buffers always have the same length for timingSafeEqual
    const receivedDigest = crypto
      .createHash("sha256")
      .update(signatureHeader)
      .digest();
    const expectedDigest = crypto
      .createHash("sha256")
      .update(FLUTTERWAVE_WEBHOOK_HASH)
      .digest();

    if (!crypto.timingSafeEqual(receivedDigest, expectedDigest)) {
      process.stderr.write(
        `[SECURITY] [flutterwaveWebhook] verif-hash does not match. Possible fake webhook, or the dashboard hash differs from FLUTTERWAVE_WEBHOOK_HASH.\n`,
      );
      res.statusCode = 401;
      res.end();
      return;
    }

    // 2. Body
    let payload: any;
    try {
      payload = await json(req);
    } catch (err) {
      process.stderr.write(
        `[flutterwaveWebhook] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.end();
      return;
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      process.stderr.write(
        `[flutterwaveWebhook] Payload is not a JSON object.\n`,
      );
      res.statusCode = 400;
      res.end();
      return;
    }

    const eventName = payload.event;
    const data = payload.data;

    // We log a short summary only: the full payload contains the customer's phone and email
    process.stdout.write(
      `[WEBHOOK] event=${eventName} id=${data?.id} tx_ref=${data?.tx_ref} status=${data?.status}\n`,
    );

    // 3. Only charge events matter here. Everything else is acknowledged so Flutterwave stops retrying.
    if (eventName !== "charge.completed") {
      res.statusCode = 200;
      res.end();
      return;
    }

    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      process.stderr.write(
        `[flutterwaveWebhook] charge.completed without a data object.\n`,
      );
      res.statusCode = 200;
      res.end();
      return;
    }

    // Other products on the same Flutterwave account send webhooks to this URL too
    const txRef = data.tx_ref;
    if (typeof txRef !== "string" || !txRef.startsWith("mastersave-dep-")) {
      process.stdout.write(
        `[WEBHOOK] Ignored: tx_ref is not a MasterSave deposit.\n`,
      );
      res.statusCode = 200;
      res.end();
      return;
    }

    // 4a. Successful payment: verify with Flutterwave, then credit (inside the service)
    if (data.status === "successful") {
      const providerTransactionId = data.id;
      if (
        (typeof providerTransactionId !== "number" &&
          typeof providerTransactionId !== "string") ||
        String(providerTransactionId).length === 0
      ) {
        process.stderr.write(
          `[flutterwaveWebhook] Successful event without a transaction id. txRef=${txRef}. The reconciliation worker will pick it up.\n`,
        );
        res.statusCode = 200;
        res.end();
        return;
      }

      try {
        const finalizeResult = await financeService.finalizeDepositSplit(
          txRef,
          String(providerTransactionId),
        );
        process.stdout.write(
          `[WEBHOOK] txRef=${txRef} finalize outcome=${finalizeResult.outcome}\n`,
        );

        // Not verified yet: answer with an error so Flutterwave retries later
        if (finalizeResult.outcome === "NOT_VERIFIED") {
          res.statusCode = 500;
          res.end();
          return;
        }

        // Every other outcome is final. Retrying would not change it, and the service already logged the details.
        res.statusCode = 200;
        res.end();
        return;
      } catch (err) {
        process.stderr.write(
          `[flutterwaveWebhook] Processing failed, answering 500 so Flutterwave retries. txRef=${txRef}: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.end();
        return;
      }
    }

    // 4b. Failed payment
    if (data.status === "failed") {
      try {
        await financeService.markDepositFailed(txRef);
        res.statusCode = 200;
        res.end();
        return;
      } catch (err) {
        process.stderr.write(
          `[flutterwaveWebhook] Could not mark deposit failed. txRef=${txRef}: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.end();
        return;
      }
    }

    // 4c. Any other status: nothing to do
    res.statusCode = 200;
    res.end();
  },

  async spendMoney(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[spendMoney] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    let activeUser: any;
    try {
      activeUser = await financeService.getActiveUserForFinance(decoded.id);
    } catch (err) {
      process.stderr.write(
        `[spendMoney] DB Error loading the account: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your account. Please try again.",
        }),
      );
      return;
    }
    if (!activeUser) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Account not found. Please log in again.",
          code: "ACCOUNT_NOT_FOUND",
        }),
      );
      return;
    }

    let body: any;
    try {
      body = await json(req);
    } catch (err) {
      process.stderr.write(
        `[spendMoney] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    const amount = body.amount;
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 10000000
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Amount must be a whole number of RWF between 100 and 10,000,000.",
        }),
      );
      return;
    }

    const idempotencyKey = body.idempotencyKey;
    if (
      typeof idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "A valid idempotencyKey is required.",
          code: "IDEMPOTENCY_KEY_REQUIRED",
        }),
      );
      return;
    }

    try {
      const result = await financeService.simulateSpendWithdrawal(
        decoded.id,
        amount,
        idempotencyKey,
      );

      if (result.outcome === "WALLET_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Wallet not found." }));
        return;
      }

      if (result.outcome === "IDEMPOTENCY_KEY_REUSED") {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "This request key was already used for a different withdrawal.",
            code: "IDEMPOTENCY_KEY_REUSED",
          }),
        );
        return;
      }

      if (result.outcome === "INSUFFICIENT_FUNDS") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Insufficient spend funds.",
            code: "INSUFFICIENT_FUNDS",
          }),
        );
        return;
      }

      // WITHDRAWN or DUPLICATE_REQUEST: the student gets the same success answer either way
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message: "Withdrawal simulated successfully.",
          duplicate: result.outcome === "DUPLICATE_REQUEST",
          details: { requestedAmount: result.requestedAmount },
        }),
      );
    } catch (err) {
      process.stderr.write(
        `[spendMoney] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't process your withdrawal. Please try again.",
        }),
      );
    }
  },

  async getGoals(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[getGoals] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    try {
      const goalsResult = await financeService.getGoals(decoded.id);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(goalsResult));
    } catch (err) {
      process.stderr.write(
        `[getGoals] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your goals. Please try again.",
        }),
      );
    }
  },

  async createGoal(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[createGoal] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    let activeUser: any;
    try {
      activeUser = await financeService.getActiveUserForFinance(decoded.id);
    } catch (err) {
      process.stderr.write(
        `[createGoal] DB Error loading the account: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your account. Please try again.",
        }),
      );
      return;
    }
    if (!activeUser) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Account not found. Please log in again.",
          code: "ACCOUNT_NOT_FOUND",
        }),
      );
      return;
    }

    let body: any;
    try {
      body = await json(req);
    } catch (err) {
      process.stderr.write(
        `[createGoal] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    const goalName = typeof body.name === "string" ? body.name.trim() : "";
    if (goalName.length < 1 || goalName.length > 60) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ error: "Goal name must be 1 to 60 characters." }),
      );
      return;
    }

    const targetAmount = body.targetAmount;
    if (
      typeof targetAmount !== "number" ||
      !Number.isInteger(targetAmount) ||
      targetAmount < 100 ||
      targetAmount > 100000000
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Target must be a whole number of RWF between 100 and 100,000,000.",
        }),
      );
      return;
    }

    if (typeof body.unlockDate !== "string") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "An unlock date is required." }));
      return;
    }

    const unlockDate = new Date(body.unlockDate);
    if (Number.isNaN(unlockDate.getTime())) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Please choose a valid unlock date." }));
      return;
    }
    if (unlockDate.getTime() <= Date.now()) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ error: "The unlock date must be in the future." }),
      );
      return;
    }
    if (unlockDate.getTime() > Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "The unlock date can be at most 10 years away.",
        }),
      );
      return;
    }

    try {
      const result = await financeService.createGoal(
        decoded.id,
        goalName,
        targetAmount,
        unlockDate.toISOString(),
      );

      if (result.outcome === "WALLET_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Wallet not found." }));
        return;
      }

      if (result.outcome === "MAX_ACTIVE_GOALS_REACHED") {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "You can have at most 3 active goals. Finish one first.",
            code: "MAX_ACTIVE_GOALS_REACHED",
          }),
        );
        return;
      }

      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Goal created.", goal: result.goal }));
    } catch (err) {
      process.stderr.write(
        `[createGoal] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't create your goal. Please try again.",
        }),
      );
    }
  },

  async withdrawFromGoal(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[withdrawFromGoal] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    let activeUser: any;
    try {
      activeUser = await financeService.getActiveUserForFinance(decoded.id);
    } catch (err) {
      process.stderr.write(
        `[withdrawFromGoal] DB Error loading the account: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your account. Please try again.",
        }),
      );
      return;
    }
    if (!activeUser) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Account not found. Please log in again.",
          code: "ACCOUNT_NOT_FOUND",
        }),
      );
      return;
    }

    let body: any;
    try {
      body = await json(req);
    } catch (err) {
      process.stderr.write(
        `[withdrawFromGoal] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    if (
      typeof body.goalId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.goalId,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "A valid goalId is required." }));
      return;
    }
    const goalId = body.goalId.toLowerCase();

    const amount = body.amount;
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 10000000
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Amount must be a whole number of RWF between 100 and 10,000,000.",
        }),
      );
      return;
    }

    const idempotencyKey = body.idempotencyKey;
    if (
      typeof idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "A valid idempotencyKey is required.",
          code: "IDEMPOTENCY_KEY_REQUIRED",
        }),
      );
      return;
    }

    try {
      const result = await financeService.withdrawFromGoal(
        decoded.id,
        goalId,
        amount,
        idempotencyKey,
        body.agreeToPenalty === true,
      );

      if (result.outcome === "WALLET_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Wallet not found." }));
        return;
      }

      if (result.outcome === "GOAL_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ error: "Goal not found.", code: "GOAL_NOT_FOUND" }),
        );
        return;
      }

      if (result.outcome === "IDEMPOTENCY_KEY_REUSED") {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "This request key was already used for a different withdrawal.",
            code: "IDEMPOTENCY_KEY_REUSED",
          }),
        );
        return;
      }

      // THE IMPULSE BLOCKER: the app steps in and offers the two ways through
      if (result.outcome === "GOAL_LOCKED") {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Friction Triggered: This savings goal is locked.",
            code: "FUNDS_LOCKED",
            friction: "LOCKED_GOAL",
            unlockDate: result.unlockDate,
            availableAmount: result.availableAmount,
            options: [
              {
                type: "COOLDOWN",
                cooldownMinutes: WITHDRAWAL_COOLDOWN_MINUTES,
              },
              { type: "PENALTY", penaltyPercent: 5 },
            ],
            message:
              "This money is locked until your goal date. You can wait out a cooldown and claim it for free, or pay a 5% penalty and take it now.",
          }),
        );
        return;
      }

      if (result.outcome === "INSUFFICIENT_FUNDS") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Insufficient available funds in this goal.",
            code: "INSUFFICIENT_FUNDS",
          }),
        );
        return;
      }

      if (result.outcome === "INSUFFICIENT_FUNDS_FOR_PENALTY") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "Insufficient funds to cover the requested amount plus the 5% penalty.",
            code: "INSUFFICIENT_FUNDS_FOR_PENALTY",
          }),
        );
        return;
      }

      // WITHDRAWN or DUPLICATE_REQUEST
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message: result.penaltyApplied
            ? "Early withdrawal processed with a 5% penalty."
            : "Withdrawal processed.",
          duplicate: result.outcome === "DUPLICATE_REQUEST",
          details: {
            requestedAmount: result.requestedAmount,
            penaltyAmount: result.penaltyAmount,
            totalDeducted: result.totalDeducted,
            penaltyApplied: result.penaltyApplied,
            goalClosed: result.goalClosed,
          },
        }),
      );
    } catch (err) {
      process.stderr.write(
        `[withdrawFromGoal] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't process your withdrawal. Please try again.",
        }),
      );
    }
  },

  // One endpoint for the whole cooldown: action = REQUEST (start waiting), CLAIM (take the money), CANCEL
  async manageWithdrawalRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[manageWithdrawalRequest] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    let activeUser: any;
    try {
      activeUser = await financeService.getActiveUserForFinance(decoded.id);
    } catch (err) {
      process.stderr.write(
        `[manageWithdrawalRequest] DB Error loading the account: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your account. Please try again.",
        }),
      );
      return;
    }
    if (!activeUser) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Account not found. Please log in again.",
          code: "ACCOUNT_NOT_FOUND",
        }),
      );
      return;
    }

    let body: any;
    try {
      body = await json(req);
    } catch (err) {
      process.stderr.write(
        `[manageWithdrawalRequest] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    const action = body.action;
    if (action !== "REQUEST" && action !== "CLAIM" && action !== "CANCEL") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ error: "action must be REQUEST, CLAIM or CANCEL." }),
      );
      return;
    }

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // ---------- REQUEST: start the cooldown ----------
    if (action === "REQUEST") {
      if (typeof body.goalId !== "string" || !uuidPattern.test(body.goalId)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "A valid goalId is required." }));
        return;
      }
      const goalId = body.goalId.toLowerCase();

      const amount = body.amount;
      if (
        typeof amount !== "number" ||
        !Number.isInteger(amount) ||
        amount < 100 ||
        amount > 10000000
      ) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "Amount must be a whole number of RWF between 100 and 10,000,000.",
          }),
        );
        return;
      }

      const idempotencyKey = body.idempotencyKey;
      if (
        typeof idempotencyKey !== "string" ||
        !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)
      ) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "A valid idempotencyKey is required.",
            code: "IDEMPOTENCY_KEY_REQUIRED",
          }),
        );
        return;
      }

      try {
        const result = await financeService.createWithdrawalRequest(
          decoded.id,
          goalId,
          amount,
          idempotencyKey,
        );

        if (result.outcome === "WALLET_NOT_FOUND") {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Wallet not found." }));
          return;
        }

        if (result.outcome === "GOAL_NOT_FOUND") {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Goal not found.",
              code: "GOAL_NOT_FOUND",
            }),
          );
          return;
        }

        if (result.outcome === "IDEMPOTENCY_KEY_REUSED") {
          res.statusCode = 409;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "This request key was already used for a different request.",
              code: "IDEMPOTENCY_KEY_REUSED",
            }),
          );
          return;
        }

        if (result.outcome === "GOAL_ALREADY_UNLOCKED") {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "This goal is already unlocked. You can withdraw without waiting.",
              code: "GOAL_ALREADY_UNLOCKED",
            }),
          );
          return;
        }

        if (result.outcome === "INSUFFICIENT_FUNDS") {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Insufficient available funds in this goal.",
              code: "INSUFFICIENT_FUNDS",
            }),
          );
          return;
        }

        // CREATED or DUPLICATE_REQUEST
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            message:
              "Cooldown started. You can claim this money when the wait is over.",
            duplicate: result.outcome === "DUPLICATE_REQUEST",
            cooldownMinutes: WITHDRAWAL_COOLDOWN_MINUTES,
            request: result.request,
          }),
        );
        return;
      } catch (err) {
        process.stderr.write(
          `[manageWithdrawalRequest / REQUEST] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "We couldn't start your cooldown. Please try again.",
          }),
        );
        return;
      }
    }

    // ---------- CLAIM and CANCEL both need a requestId ----------
    if (
      typeof body.requestId !== "string" ||
      !uuidPattern.test(body.requestId)
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "A valid requestId is required." }));
      return;
    }
    const requestId = body.requestId.toLowerCase();

    // ---------- CLAIM: take the money after the wait ----------
    if (action === "CLAIM") {
      try {
        const result = await financeService.claimWithdrawalRequest(
          decoded.id,
          requestId,
        );

        if (
          result.outcome === "WALLET_NOT_FOUND" ||
          result.outcome === "REQUEST_NOT_FOUND"
        ) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Request not found.",
              code: "REQUEST_NOT_FOUND",
            }),
          );
          return;
        }

        if (result.outcome === "REQUEST_CANCELLED") {
          res.statusCode = 409;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "This request was cancelled.",
              code: "REQUEST_CANCELLED",
            }),
          );
          return;
        }

        if (result.outcome === "NOT_READY") {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "The cooldown is not finished yet.",
              code: "COOLDOWN_NOT_FINISHED",
              readyAt: result.readyAt,
            }),
          );
          return;
        }

        // CLAIMED or ALREADY_CLAIMED
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            message: "Withdrawal processed.",
            duplicate: result.outcome === "ALREADY_CLAIMED",
            details: { requestedAmount: result.requestedAmount },
          }),
        );
        return;
      } catch (err) {
        process.stderr.write(
          `[manageWithdrawalRequest / CLAIM] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "We couldn't process your withdrawal. Please try again.",
          }),
        );
        return;
      }
    }

    // ---------- CANCEL: release the reserved money ----------
    try {
      const result = await financeService.cancelWithdrawalRequest(
        decoded.id,
        requestId,
      );

      if (
        result.outcome === "WALLET_NOT_FOUND" ||
        result.outcome === "REQUEST_NOT_FOUND"
      ) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Request not found.",
            code: "REQUEST_NOT_FOUND",
          }),
        );
        return;
      }

      if (result.outcome === "ALREADY_CLAIMED") {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "This request was already claimed and cannot be cancelled.",
            code: "ALREADY_CLAIMED",
          }),
        );
        return;
      }

      // CANCELLED or ALREADY_CANCELLED
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message: "Cooldown cancelled. Your money stays in your goal.",
          duplicate: result.outcome === "ALREADY_CANCELLED",
        }),
      );
    } catch (err) {
      process.stderr.write(
        `[manageWithdrawalRequest / CANCEL] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't cancel your request. Please try again.",
        }),
      );
    }
  },

  async moveUndecided(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[moveUndecided] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    let activeUser: any;
    try {
      activeUser = await financeService.getActiveUserForFinance(decoded.id);
    } catch (err) {
      process.stderr.write(
        `[moveUndecided] DB Error loading the account: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't load your account. Please try again.",
        }),
      );
      return;
    }
    if (!activeUser) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Account not found. Please log in again.",
          code: "ACCOUNT_NOT_FOUND",
        }),
      );
      return;
    }

    let body: any;
    try {
      body = await json(req);
    } catch (err) {
      process.stderr.write(
        `[moveUndecided] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    const amount = body.amount;
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 10000000
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Amount must be a whole number of RWF between 100 and 10,000,000.",
        }),
      );
      return;
    }

    // goalId missing or null = move the money to Spend
    let goalId: string | null = null;
    if (body.goalId !== undefined && body.goalId !== null) {
      if (
        typeof body.goalId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          body.goalId,
        )
      ) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ error: "goalId must be a valid goal id or empty." }),
        );
        return;
      }
      goalId = body.goalId.toLowerCase();
    }

    const idempotencyKey = body.idempotencyKey;
    if (
      typeof idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "A valid idempotencyKey is required.",
          code: "IDEMPOTENCY_KEY_REQUIRED",
        }),
      );
      return;
    }

    try {
      const result = await financeService.moveUndecided(
        decoded.id,
        amount,
        goalId,
        idempotencyKey,
      );

      if (result.outcome === "WALLET_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Wallet not found." }));
        return;
      }

      if (result.outcome === "GOAL_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ error: "Goal not found.", code: "GOAL_NOT_FOUND" }),
        );
        return;
      }

      if (result.outcome === "IDEMPOTENCY_KEY_REUSED") {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "This request key was already used for a different move.",
            code: "IDEMPOTENCY_KEY_REUSED",
          }),
        );
        return;
      }

      if (result.outcome === "INSUFFICIENT_UNDECIDED_FUNDS") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Not enough undecided money for this move.",
            code: "INSUFFICIENT_UNDECIDED_FUNDS",
          }),
        );
        return;
      }

      if (result.outcome === "GOAL_ROOM_EXCEEDED") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "That is more than this goal still needs.",
            code: "GOAL_ROOM_EXCEEDED",
            roomAmount: result.roomAmount,
          }),
        );
        return;
      }

      // MOVED or DUPLICATE_REQUEST
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message: goalId === null ? "Moved to Spend." : "Added to your goal.",
          duplicate: result.outcome === "DUPLICATE_REQUEST",
          details: { movedAmount: result.movedAmount },
        }),
      );
    } catch (err) {
      process.stderr.write(
        `[moveUndecided] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't move your money. Please try again.",
        }),
      );
    }
  },

  async renameGoal(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[renameGoal] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    let body: any;
    try {
      body = await json(req);
    } catch (err) {
      process.stderr.write(
        `[renameGoal] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    if (
      typeof body.goalId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.goalId,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "A valid goalId is required." }));
      return;
    }
    const goalId = body.goalId.toLowerCase();

    const goalName = typeof body.name === "string" ? body.name.trim() : "";
    if (goalName.length < 1 || goalName.length > 60) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ error: "Goal name must be 1 to 60 characters." }),
      );
      return;
    }

    try {
      const result = await financeService.renameGoal(
        decoded.id,
        goalId,
        goalName,
      );

      if (result.outcome === "GOAL_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ error: "Goal not found.", code: "GOAL_NOT_FOUND" }),
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Goal renamed.", goal: result.goal }));
    } catch (err) {
      process.stderr.write(
        `[renameGoal] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't rename your goal. Please try again.",
        }),
      );
    }
  },

  async deleteGoal(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token as string, ACCESS_TOKEN_SECRET, {
        algorithms: ["HS256"],
      }) as JWTPayload;
      if (decoded.token_use !== "access") throw new Error("Invalid token type");
    } catch (err) {
      const jwtErrName = (err as Error)?.name;
      const jwtErrMsg = (err as Error)?.message || "";
      const isExpired = jwtErrName === "TokenExpiredError";
      const isInvalidSignature =
        jwtErrName === "JsonWebTokenError" ||
        jwtErrMsg === "Invalid token type";
      process.stderr.write(
        `[deleteGoal] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isExpired
            ? "Access token expired. Please refresh and retry."
            : isInvalidSignature
              ? "Access token is invalid or tampered. Please log in again."
              : "Unauthorized.",
          code: isExpired
            ? "TOKEN_EXPIRED"
            : isInvalidSignature
              ? "TOKEN_INVALID"
              : "AUTH_UNKNOWN",
        }),
      );
      return;
    }

    // DELETE requests carry no body, so the goal id travels in the query string: ?goalId=...
    const parsedUrl = new URL(req.url || "/", "http://localhost");
    const goalIdRaw = parsedUrl.searchParams.get("goalId") || "";

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        goalIdRaw,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "A valid goalId is required." }));
      return;
    }
    const goalId = goalIdRaw.toLowerCase();

    try {
      const result = await financeService.deleteGoal(decoded.id, goalId);

      if (result.outcome === "WALLET_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Wallet not found." }));
        return;
      }

      if (result.outcome === "GOAL_NOT_FOUND") {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ error: "Goal not found.", code: "GOAL_NOT_FOUND" }),
        );
        return;
      }

      if (result.outcome === "GOAL_HAS_FUNDS") {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "This goal still holds money. Withdraw it first, then you can delete the goal.",
            code: "GOAL_HAS_FUNDS",
            savedAmount: result.savedAmount,
            hasPendingWithdrawals: result.hasPendingWithdrawals,
            isUnlocked: result.isUnlocked,
          }),
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Goal deleted." }));
    } catch (err) {
      process.stderr.write(
        `[deleteGoal] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't delete your goal. Please try again.",
        }),
      );
    }
  },
};

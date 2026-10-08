//src/app.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { apiRoutes } from "./features/api.routes.js";
import { redisClient } from "./db/redis.js";
import jwt from "jsonwebtoken";
import type { JWTPayload } from "./features/auth/auth.types.js";
import { trackUserActivity } from "./features/auth/auth.tracker.js";

import {
  ACCESS_TOKEN_SECRET,
  ALLOWED_ORIGINS,
  CLIENT_URL,
  NODE_ENV,
  TRUSTED_PROXY_COUNT,
} from "./config/env.js";

// In-memory global limiter: no Redis round trip on every request.
// (Fine for a single server instance. With several instances, each keeps its own count.)
const globalRateLimitStore = new Map<
  string,
  { count: number; resetAt: number }
>();

const globalRateLimitCleanup = setInterval(() => {
  try {
    const nowMs = Date.now();
    for (const [key, entry] of globalRateLimitStore) {
      if (entry.resetAt <= nowMs) globalRateLimitStore.delete(key);
    }
  } catch (err) {
    process.stderr.write(
      `[GLOBAL_LIMIT_CLEANUP_ERROR] ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
    );
  }
}, 60000);
globalRateLimitCleanup.unref();

// Maintenance flag cached for 5 seconds so Redis is not hit on every request
let maintenanceFlagCache = { value: "false", fetchedAt: 0 };

export const app = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  const startTime = process.hrtime();

  let ip = "unknown_ip";
  const forwardedForList = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (
    TRUSTED_PROXY_COUNT > 0 &&
    forwardedForList.length >= TRUSTED_PROXY_COUNT
  ) {
    ip =
      forwardedForList[forwardedForList.length - TRUSTED_PROXY_COUNT] ||
      "unknown_ip";
  } else {
    ip = req.socket.remoteAddress || "unknown_ip";
  }

  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, GET, PUT, DELETE, OPTIONS, PATCH",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Refresh-Token",
  );
  res.setHeader("Content-Type", "application/json");

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );

  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ${CLIENT_URL.replace(/,/g, " ")}`,
  );

  res.on("finish", () => {
    try {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const durationInMs = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
      const log = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${durationInMs}ms`,
        ip: ip,
        userAgent: req.headers["user-agent"],
      };
      process.stdout.write(JSON.stringify(log) + "\n");
    } catch (err) {
      process.stderr.write(
        `[LOGGER_ERROR] Failed to write access log: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
    }
  });

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (NODE_ENV !== "development") {
    try {
      const nowMs = Date.now();
      let limitEntry = globalRateLimitStore.get(ip);

      if (!limitEntry || limitEntry.resetAt <= nowMs) {
        limitEntry = { count: 0, resetAt: nowMs + 60000 };
        globalRateLimitStore.set(ip, limitEntry);
      }

      limitEntry.count++;

      // 1000/min (not 500) because many mobile users share one carrier IP
      if (limitEntry.count > 1000) {
        res.statusCode = 429;
        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Retry-After",
          String(Math.ceil((limitEntry.resetAt - nowMs) / 1000)),
        );
        res.end(
          JSON.stringify({
            error: "Too many requests. Please wait a moment and try again.",
          }),
        );
        return;
      }
    } catch (err) {
      process.stderr.write(
        `[GLOBAL_LIMIT_WARN] Global rate limiter error, request allowed: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
    }
  }

  let parseURL: URL;
  try {
    parseURL = new URL(req.url || "/", "http://localhost");
  } catch (err) {
    process.stderr.write(
      `[app] Malformed request URL: ${(err as Error).message}\nStack: ${(err as Error).stack}\nurl=${req.url}\n`,
    );
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Bad request." }));
    return;
  }
  const { pathname } = parseURL;

  const maintenanceExemptPaths = [
    "/",
    "/api/v1/health",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/social-login",
    "/api/v1/auth/logout",
    "/api/v1/auth/ban-check",
    "/api/v1/finance/webhook",
  ];

  if (Date.now() - maintenanceFlagCache.fetchedAt > 5000) {
    try {
      const maintenanceRes =
        await redisClient.get<string>("maintenance:status");
      maintenanceFlagCache = {
        value: maintenanceRes || "false",
        fetchedAt: Date.now(),
      };
    } catch (err) {
      process.stderr.write(
        `[REDIS_NETWORK_WARN] Maintenance check failed, keeping previous value: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      maintenanceFlagCache.fetchedAt = Date.now();
    }
  }
  const isMaintenance = maintenanceFlagCache.value;

  if (isMaintenance === "true" && !maintenanceExemptPaths.includes(pathname)) {
    const authHeader = req.headers.authorization;
    let isSuperAdmin = false;

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];

        if (!token) throw new Error("Missing token string");

        const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET as string, {
          algorithms: ["HS256"],
        }) as unknown as JWTPayload;

        if (decoded.role === "super_admin" && decoded.token_use === "access") {
          isSuperAdmin = true;
        }
      } catch (err) {
        process.stderr.write(
          `[MAINTENANCE] Token Verify Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
      }
    }

    if (!isSuperAdmin) {
      let message = "The Lab is undergoing critical updates.";

      try {
        const customMessage = await redisClient.get<string>(
          "maintenance:message",
        );
        if (customMessage) message = customMessage;
      } catch (err) {
        process.stderr.write(
          `[MAINTENANCE] Failed to fetch custom maintenance message: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
      }

      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Maintenance Mode Active", message }));
      return;
    }
  }

  // --- STRICT DOS PROTECTION BLOCK ---
  if (["POST", "PATCH", "PUT"].includes(req.method || "")) {
    const contentType = req.headers["content-type"] || "";
    const isMultipart = contentType.includes("multipart/form-data");
    // 1MB for JSON
    const limit = isMultipart ? 5 * 1024 * 1024 + 64 * 1024 : 1024 * 1024;
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    const isChunked = req.headers["transfer-encoding"] === "chunked";

    if (contentLength > limit) {
      process.stderr.write(
        `[SECURITY] Blocked oversized payload from IP: ${ip}. Size: ${contentLength} bytes.\n`,
      );
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: isMultipart
            ? "That file is too large. Please choose a file smaller than 5MB."
            : "The data you sent is too large. The maximum allowed is 1MB.",
        }),
      );
      return;
    }

    // JSON streams from node:stream/consumers are highly vulnerable to chunked OOM DoS attacks.
    // Standard browsers NEVER send chunked JSON, so we strictly forbid it for non-multipart requests.
    if (isChunked && !isMultipart) {
      process.stderr.write(
        `[SECURITY] Blocked malicious chunked JSON payload from IP: ${ip}.\n`,
      );
      res.statusCode = 411;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Length Required. Chunked encoding is strictly forbidden for JSON payloads.",
        }),
      );
      return;
    }
  }

  trackUserActivity(req).catch((err) => {
    process.stderr.write(
      `[TRACKER_UNHANDLED] ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
    );
  });
  if (pathname === "/") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: "Master save api is online" }));
    return;
  }

  try {
    const handled = await apiRoutes({ req, res, pathname, parseURL });
    if (!handled && !res.headersSent) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Route not found" }));
    }
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: "FATAL",
        context: "Request Handling Error",
        error: (err as Error).message,
        stack: (err as Error).stack,
      }) + "\n",
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  }
};

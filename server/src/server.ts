// src/server.ts
import { PORT, HOST } from "./config/env.js";
import http from "node:http";
import { promisify } from "node:util";
import { app } from "./app.js";
import { connectWithRetry, pool } from "./db/psql.js";
import { connectRedis } from "./db/redis.js";
import { verifyCloudinary } from "./db/cloudinary.js";
import { startTokenCleanupWorker } from "./workers/tokenCleanup.js";
import { startDepositReconciliationWorker } from "./workers/depositReconciliation.js";

const server = http.createServer((req, res) => {
  app(req, res).catch((err: any) => {
    process.stderr.write(
      JSON.stringify({
        level: "FATAL",
        context: "Unhandled error escaped app()",
        method: req.method,
        url: req.url,
        error: err?.message,
        stack: err?.stack,
        timestamp: new Date().toISOString(),
      }) + "\n",
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Something went wrong on our side. Please try again.",
        }),
      );
    } else if (!res.writableEnded) {
      res.end();
    }
  });
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;

const closeServer = promisify(server.close.bind(server));

let isShuttingDown = false;

const performGracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🫩  Received ${signal}. Starting graceful shutdown...`);

  const forceExit = setTimeout(() => {
    process.stderr.write(
      JSON.stringify({
        level: "FATAL",
        message: "Shutdown timed out after 10 seconds, forcing exit.",
        timestamp: new Date().toISOString(),
      }) + "\n",
    );
    process.exit(1);
  }, 10000);

  try {
    console.log(
      "🫩  Severing idle HTTP connections to prevent keep-alive hang...",
    );
    if ("closeIdleConnections" in server) {
      (server as any).closeIdleConnections();
    }

    console.log(
      "🫩  Closing HTTP server (waiting for active requests to finish)...",
    );
    await closeServer();

    console.log("🫩  Closing Postgres DB connection pool...");
    await pool.end();

    console.log("🫩  All services closed gracefully. Goodbye!");
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err: any) {
    process.stderr.write(
      JSON.stringify({
        level: "ERROR",
        context: "Shutdown",
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      }) + "\n",
    );
    process.exit(1);
  }
};

process.on("SIGINT", () => performGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => performGracefulShutdown("SIGTERM"));

process.on("unhandledRejection", (reason: any) => {
  process.stderr.write(
    JSON.stringify({
      level: "FATAL",
      context: "unhandledRejection",
      error: reason?.message || String(reason),
      stack: reason?.stack,
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
});

process.on("uncaughtException", (err: any) => {
  process.stderr.write(
    JSON.stringify({
      level: "FATAL",
      context: "uncaughtException",
      error: err?.message,
      stack: err?.stack,
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
  process.exit(1);
});

const startServer = async () => {
  try {
    console.log("🥹  Initializing Production Environment...");

    await verifyCloudinary();
    await connectWithRetry();
    await connectRedis();

    startTokenCleanupWorker();
    startDepositReconciliationWorker();
    server.listen(parseInt(PORT, 10), HOST, () => {
      console.log(`🥹  Server listening on http://${HOST}:${PORT}`);
    });
  } catch (error: any) {
    const extractMessage = (err: any): string => {
      if (!err) return "Unknown error";
      if (err.errors && Array.isArray(err.errors) && err.errors.length > 0) {
        return err.errors[0].message || err.message;
      }
      return err.message || "No message provided";
    };

    const rootCause = error.cause
      ? extractMessage(error.cause)
      : "No underlying cause";

    const fatalLog = {
      level: "FATAL",
      message: error.message,
      stack: error.stack,
      root_cause: rootCause,
      code: error.cause?.code || error.cause?.errors?.[0]?.code,
      timestamp: new Date().toISOString(),
    };

    process.stderr.write(JSON.stringify(fatalLog) + "\n");

    console.error(`🫩  Fatal startup error: ${error.message}`);
    console.error(`🫩  Root Cause: ${rootCause}`);

    process.exit(1);
  }
};

startServer();

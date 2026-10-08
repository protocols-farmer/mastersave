//src/features/api.routes.ts

import type { IncomingMessage, ServerResponse } from "node:http";
import { pool } from "../db/psql.js";
import { redisClient } from "../db/redis.js";
import { authRoutes } from "./auth/auth.routes.js";
import { financeRoutes } from "./finance/finance.routes.js";
export const apiRoutes = async ({
  req,
  res,
  pathname,
  // _parseURL,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  parseURL: URL;
}): Promise<boolean> => {
  if (pathname === "/api/v1/health" && req.method === "GET") {
    try {
      await Promise.all([pool.query("SELECT 1"), redisClient.ping()]);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (err: any) {
      process.stderr.write(
        JSON.stringify({
          level: "ERROR",
          context: "Health Check Failure",
          error: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString(),
        }) + "\n",
      );

      process.stderr.write(
        `[HEALTH_CRASH_DUMP] ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}\n`,
      );

      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "unhealthy",
          error: "Core dependency failure",
        }),
      );
    }
    return true;
  }

  const authHandled = await authRoutes({ req, res, pathname });
  if (authHandled) return true;

  const financeHandled = await financeRoutes({ req, res, pathname });
  if (financeHandled) return true;

  return false;
};

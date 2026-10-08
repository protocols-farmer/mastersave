//src/features/auth/auth.tracker.ts
import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import { authService } from "./auth.service.js";
import { redisClient } from "../../db/redis.js";
import type { JWTPayload } from "./auth.types.js";
import { ACCESS_TOKEN_SECRET } from "../../config/env.js";
const recentlyTrackedUsers = new Map<string, number>();

export const trackUserActivity = async (
  req: IncomingMessage,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return;
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return;
    }

    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET, {
      algorithms: ["HS256"],
    }) as JWTPayload;

    const userId = decoded.id;
    const lastTrackedAt = recentlyTrackedUsers.get(userId);
    if (lastTrackedAt && Date.now() - lastTrackedAt < 3600000) {
      return;
    }

    const redisKey = `user:activity:${userId}`;
    const alreadyTracked = await redisClient.get<string>(redisKey);

    if (!alreadyTracked) {
      await authService.updateLastActiveTimestamp(userId);

      await redisClient.set(redisKey, "true", { ex: 86400 });
    }

    // Remember this user in memory for an hour, so their next requests skip Redis completely
    if (recentlyTrackedUsers.size > 10000) recentlyTrackedUsers.clear();
    recentlyTrackedUsers.set(userId, Date.now());
  } catch (err) {
    if ((err as Error)?.name === "TokenExpiredError") return;

    process.stderr.write(
      `[AUTH_TRACKER ERROR]: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
    );
  }
};

//src/features/auth/auth.controller.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "node:stream/consumers";
import crypto from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { authService } from "./auth.service.js";
import { financeService } from "../finance/finance.service.js";
import { redisClient } from "../../db/redis.js";
import type {
  SignupDTO,
  LoginDTO,
  ChangePasswordDTO,
  UpdateAccountDTO,
  User,
  JWTPayload,
  RevokeSpecificSessionDTO,
} from "./auth.types.js";
import { mediaStorage } from "../../db/cloudinary.js";
import busboy from "busboy";
import { OAuth2Client } from "google-auth-library";

// --- ENV IMPORTS ---
import {
  ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY_MINUTES,
  REFRESH_TOKEN_EXPIRY_MINUTES,
  NODE_ENV,
  GOOGLE_CLIENT_IDS,
  TRUSTED_PROXY_COUNT,
  DEFAULT_AVATAR_URL,
} from "../../config/env.js";

// ONE Google client for the whole server. It caches Google's public signing keys, so
// verifying a token does not download those keys from Google on every single login.
const googleOAuthClient = new OAuth2Client();

export const authController = {
  async banCheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const isDev = NODE_ENV === "development";
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

    res.setHeader("Content-Type", "application/json");
    if (isDev) {
      res.statusCode = 200;
      res.end(JSON.stringify({ banned: false, remainingSeconds: 0 }));
      return;
    }

    try {
      const remainingSeconds =
        ip !== "unknown_ip"
          ? await redisClient.ttl(`ratelimit:login:ban:ip:${ip}`)
          : 0;

      if (remainingSeconds > 0) {
        res.statusCode = 200;
        res.end(JSON.stringify({ banned: true, remainingSeconds }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ banned: false, remainingSeconds: 0 }));
    } catch (err) {
      process.stderr.write(
        `[banCheck] Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Failed to check ban status" }));
    }
  },

  async signup(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: SignupDTO;
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

    if (NODE_ENV !== "development" && ip !== "unknown_ip") {
      try {
        const signupKey = `ratelimit:signup:ip:${ip}`;
        // ONE Redis request that is also atomic: create the key with its expiry (only if
        // it does not exist yet) and increment it. Before this it was two separate requests.
        const signupResults = await redisClient
          .multi()
          .set(signupKey, 0, { ex: 3600, nx: true })
          .incr(signupKey)
          .exec();
        const signupCount = Number(signupResults[1]);

        if (signupCount > 30) {
          res.statusCode = 429;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "Too many accounts created from this IP. Please try again later.",
            }),
          );
          return;
        }
      } catch (err) {
        process.stderr.write(
          `[signup] Rate limiter error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
      }
    }

    try {
      body = (await json(req)) as SignupDTO;
    } catch (err) {
      process.stderr.write(
        `[signup] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      (body.email !== undefined && typeof body.email !== "string") ||
      (body.password !== undefined && typeof body.password !== "string") ||
      (body.confirmPassword !== undefined &&
        typeof body.confirmPassword !== "string")
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    try {
      const email = body.email?.toLowerCase().trim();
      const password = body.password;
      const confirmPassword = body.confirmPassword;

      if (
        !email ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ error: "A valid email address is required." }),
        );
        return;
      }

      if (!password || password.length < 6 || password.length > 50) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Password must be 6-50 characters." }));
        return;
      }

      if (password !== confirmPassword) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Passwords do not match." }));
        return;
      }

      let passwordHash: string;
      try {
        passwordHash = await argon2.hash(password);
      } catch (hashErr) {
        process.stderr.write(
          `[signup] Argon2 hash failed: ${(hashErr as Error).message}\nStack: ${(hashErr as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "We couldn't create your account right now. Please try again.",
          }),
        );
        return;
      }

      // Generate a base username and name based on the email prefix
      const emailParts = email.split("@");
      const emailPrefix = emailParts[0];

      if (!emailPrefix) {
        process.stderr.write(
          `[signup] Fatal Logic Error: email.split("@") returned undefined for the submitted email\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Failed to parse email address during account creation.",
          }),
        );
        return;
      }

      let baseUsername = emailPrefix.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (baseUsername.length < 3) {
        baseUsername = baseUsername + "user";
      }
      // A username must start with a letter, so it can never look like a phone number
      if (!/^[a-z]/.test(baseUsername)) {
        baseUsername = "user" + baseUsername;
      }
      // 14 chars + 6 random hex = 20 max, which is the database limit
      if (baseUsername.length > 14) {
        baseUsername = baseUsername.substring(0, 14);
      }
      let finalUsername = baseUsername;
      let attempt = 0;
      let success = false;
      let newUser: any = null;

      const defaultAvatarUrl = DEFAULT_AVATAR_URL;

      // Loop up to 5 times to handle unique constraint collisions for username
      while (attempt < 5 && !success) {
        try {
          const result = await authService.signup(
            email,
            finalUsername,
            finalUsername, // Passing finalUsername as the 'name' as well per your instructions
            passwordHash,
            defaultAvatarUrl,
          );
          newUser = result.rows[0];
          success = true;
        } catch (err: any) {
          const pgCode = err?.code;
          const pgConstraint = err?.constraint || "";

          if (pgCode === "23505" && pgConstraint.includes("email")) {
            process.stderr.write(
              `[signup] Duplicate email rejected (23505) constraint=${pgConstraint}\n`,
            );
            res.statusCode = 409;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "Email already registered. Please log in.",
                field: "email",
                code: "EMAIL_TAKEN",
              }),
            );
            return;
          } else if (pgCode === "23505" && pgConstraint.includes("username")) {
            process.stderr.write(
              `[signup] Username collision for ${finalUsername}. Generating new suffix...\n`,
            );
            finalUsername =
              baseUsername + crypto.randomBytes(3).toString("hex");
            attempt++;
          } else {
            process.stderr.write(
              `[signup] Fatal DB error during local user creation. code=${pgCode} constraint=${pgConstraint}: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
            );
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "Failed to create your account due to a server error.",
              }),
            );
            return;
          }
        }
      }

      if (!success) {
        process.stderr.write(
          `[signup] Failed to generate a unique username after 5 attempts (base=${baseUsername}).\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Could not generate a unique username. Please try again.",
          }),
        );
        return;
      }

      const rawRefreshToken = crypto.randomBytes(64).toString("hex");
      const hashedRefreshToken = crypto
        .createHash("sha256")
        .update(rawRefreshToken)
        .digest("hex");

      const refreshExpiresAt = new Date(
        Date.now() + REFRESH_TOKEN_EXPIRY_MINUTES * 60 * 1000,
      );

      const userAgent = req.headers["user-agent"] || "unknown";

      try {
        await authService.createRefreshToken(
          newUser.id,
          hashedRefreshToken,
          refreshExpiresAt,
          userAgent,
          ip,
          null,
        );
      } catch (tokenErr) {
        process.stderr.write(
          `[signup] Account CREATED (userId=${newUser.id}) but refresh token creation failed: ${(tokenErr as Error).message}\nStack: ${(tokenErr as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "Your account was created, but we couldn't sign you in. Please log in with your new details.",
            code: "ACCOUNT_CREATED_LOGIN_REQUIRED",
          }),
        );
        return;
      }

      const payload: JWTPayload = {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        token_use: "access",
      };
      const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, {
        expiresIn: `${ACCESS_TOKEN_EXPIRY_MINUTES}m`,
      });

      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message: "User created",
          user: {
            id: newUser.id,
            username: newUser.username,
            name: newUser.name,
            email: newUser.email,
            phone_number: null,
            has_local_password: true,
            avatar_url: defaultAvatarUrl,
            role: newUser.role,
          },
          accessToken,
          refreshToken: rawRefreshToken, // FOR REACT NATIVE EXPO SECURE STORE
        }),
      );
      return;
    } catch (err) {
      process.stderr.write(
        `[signup] Unexpected DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Signup failed due to an unexpected server error. Please try again.",
        }),
      );
      return;
    }
  },

  async login(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const isDev = NODE_ENV === "development";
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

    let body: LoginDTO;
    try {
      body = (await json(req)) as LoginDTO;
    } catch (err) {
      process.stderr.write(
        `[login] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      (body.identifier !== undefined && typeof body.identifier !== "string") ||
      (body.password !== undefined && typeof body.password !== "string")
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }

    let identifier = body.identifier?.toLowerCase().trim() || "";

    // A phone number typed in different formats must hit the SAME rate-limit counters.
    // Emails contain "@" and usernames start with a letter, so neither is touched here.
    if (!identifier.includes("@") && /^[0-9+]/.test(identifier)) {
      identifier = identifier.replace(/[\s-]/g, "");
      if (identifier.startsWith("07")) {
        identifier = "+250" + identifier.substring(1);
      } else if (identifier.startsWith("250")) {
        identifier = "+" + identifier;
      }
    }
    if (identifier.length > 254) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Please enter a valid email, username or phone number.",
        }),
      );
      return;
    }
    if (!isDev) {
      try {
        // Both lookups run at the same time, so the wait is ONE Redis request instead of two
        const [ipBan, userBan] = await Promise.all([
          ip !== "unknown_ip"
            ? redisClient.ttl(`ratelimit:login:ban:ip:${ip}`)
            : Promise.resolve(0),
          redisClient.ttl(`ratelimit:login:ban:user:${identifier}`),
        ]);

        const highestBan = Math.max(ipBan, userBan);

        if (highestBan > 0) {
          res.statusCode = 429;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Retry-After", String(highestBan));
          res.end(
            JSON.stringify({
              error: "Too many attempts. You are temporarily banned.",
              remainingSeconds: highestBan,
            }),
          );
          return;
        }
      } catch (err) {
        process.stderr.write(
          `[login] Rate limiter check error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
      }
    }

    const recordFailure = async () => {
      let isBanned = false;
      let maxBanTime = 0;

      if (isDev) return { isBanned, maxBanTime };
      try {
        if (ip !== "unknown_ip") {
          // The per-IP limit is deliberately LOOSE: many Rwandan users share one carrier IP (CGNAT).
          // The strict limit is per identifier below.
          const ipFailResults = await redisClient
            .multi()
            .set(`ratelimit:login:fail:ip:${ip}`, 0, { ex: 86400, nx: true })
            .incr(`ratelimit:login:fail:ip:${ip}`)
            .exec();
          const ipFailCount = Number(ipFailResults[1]);
          if (ipFailCount >= 30) {
            let banTime = 900;
            if (ipFailCount === 31) banTime = 1800;
            if (ipFailCount >= 32) banTime = 3600;
            await redisClient.set(`ratelimit:login:ban:ip:${ip}`, "true", {
              ex: banTime,
            });
            isBanned = true;
            maxBanTime = Math.max(maxBanTime, banTime);
          }
        }

        if (identifier) {
          const userFailResults = await redisClient
            .multi()
            .set(`ratelimit:login:fail:user:${identifier}`, 0, {
              ex: 86400,
              nx: true,
            })
            .incr(`ratelimit:login:fail:user:${identifier}`)
            .exec();
          const userFailCount = Number(userFailResults[1]);
          if (userFailCount >= 5) {
            let banTime = 900;
            if (userFailCount === 6) banTime = 1800;
            if (userFailCount >= 7) banTime = 3600;
            await redisClient.set(
              `ratelimit:login:ban:user:${identifier}`,
              "true",
              { ex: banTime },
            );
            isBanned = true;
            maxBanTime = Math.max(maxBanTime, banTime);
          }
        }
      } catch (e) {
        process.stderr.write(
          `[login] Rate limiter strike error: ${(e as Error).message}\nStack: ${(e as Error).stack}\n`,
        );
      }
      return { isBanned, maxBanTime };
    };

    if (!identifier) {
      const failure = await recordFailure();
      if (failure.isBanned) {
        res.statusCode = 429;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Retry-After", String(failure.maxBanTime));
        res.end(
          JSON.stringify({
            error: "Too many attempts. You are temporarily banned.",
            remainingSeconds: failure.maxBanTime,
          }),
        );
        return;
      }
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Email, Username, or Phone Number is required.",
        }),
      );
      return;
    }

    const password = body.password || "";
    if (!password || password.length < 6 || password.length > 50) {
      const failure = await recordFailure();
      if (failure.isBanned) {
        res.statusCode = 429;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Retry-After", String(failure.maxBanTime));
        res.end(
          JSON.stringify({
            error: "Too many attempts. You are temporarily banned.",
            remainingSeconds: failure.maxBanTime,
          }),
        );
        return;
      }
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Password must be 6-50 characters." }));
      return;
    }

    try {
      let user: User | undefined;

      if (identifier.includes("@")) {
        // Contains "@" -> it can only be an email
        const emailResult = await authService.findUserByEmail(identifier);
        user = emailResult.rows[0] as User | undefined;
      } else {
        // Try it as a Rwandan phone number first (users type 07..., DB stores +2507...)
        let loginPhone = identifier.replace(/[\s-]/g, "");
        if (loginPhone.startsWith("07")) {
          loginPhone = "+250" + loginPhone.substring(1);
        } else if (loginPhone.startsWith("250")) {
          loginPhone = "+" + loginPhone;
        }

        if (/^\+2507[2389]\d{7}$/.test(loginPhone)) {
          const phoneResult = await authService.findUserByPhone(loginPhone);
          user = phoneResult.rows[0] as User | undefined;
        }

        // Not a phone, or no phone match -> it is a username
        if (!user) {
          const usernameResult =
            await authService.findUserByUsername(identifier);
          user = usernameResult.rows[0] as User | undefined;
        }
      }

      const DUMMY_HASH =
        "$argon2id$v=19$m=65536,t=3,p=4$Wsc9jUU9AZRrUF7kN36guw$s8vga3AT4etuy5qcnJF/C8JWVfozcmBo12NhhGnCEMM";

      const hashToVerifyAgainst =
        user && user.password_hash !== null ? user.password_hash : DUMMY_HASH;

      const passwordMatches = await argon2.verify(
        hashToVerifyAgainst,
        password,
      );

      if (!user || !passwordMatches) {
        const failure = await recordFailure();
        if (failure.isBanned) {
          res.statusCode = 429;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Retry-After", String(failure.maxBanTime));
          res.end(
            JSON.stringify({
              error: "Too many attempts. You are temporarily banned.",
              remainingSeconds: failure.maxBanTime,
            }),
          );
          return;
        }
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Incorrect email, username, phone number or password.",
          }),
        );
        return;
      }

      const fullUser = user;

      const rawRefreshToken = crypto.randomBytes(64).toString("hex");
      const hashedRefreshToken = crypto
        .createHash("sha256")
        .update(rawRefreshToken)
        .digest("hex");

      const refreshExpiresAt = new Date(
        Date.now() + REFRESH_TOKEN_EXPIRY_MINUTES * 60 * 1000,
      );
      const userAgent = req.headers["user-agent"] || "unknown";

      await authService.createRefreshToken(
        user.id,
        hashedRefreshToken,
        refreshExpiresAt,
        userAgent,
        ip,
        null,
      );

      const payload: JWTPayload = {
        id: user.id,
        username: user.username,
        role: user.role,
        token_use: "access",
      };
      const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, {
        expiresIn: `${ACCESS_TOKEN_EXPIRY_MINUTES}m`,
      });

      if (!isDev) {
        // NOT awaited: the user does not wait for Redis to get the login response.
        // One DEL request for both keys. If it fails, the full error is still logged.
        redisClient
          .del(
            `ratelimit:login:fail:user:${identifier}`,
            `ratelimit:login:ban:user:${identifier}`,
          )
          .catch((e) => {
            process.stderr.write(
              `[login] Rate limiter clear error: ${(e as Error).message}\nStack: ${(e as Error).stack}\n`,
            );
          });
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");

      res.end(
        JSON.stringify({
          accessToken,
          refreshToken: rawRefreshToken,
          user: {
            id: fullUser.id,
            username: fullUser.username,
            name: fullUser.name || null,
            email: fullUser.email || null,
            phone_number: fullUser.phone_number || null,
            has_local_password: fullUser.password_hash !== null,
            avatar_url: fullUser.avatar_url || null,
            role: fullUser.role,
          },
        }),
      );

      return;
    } catch (err) {
      // A database/server fault is NOT the user's fault, so we do not call recordFailure() here
      process.stderr.write(
        `[login] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't log you in right now. Please try again.",
        }),
      );
      return;
    }
  },

  async refresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

    let body: { refreshToken?: string } = {};
    try {
      if (req.method === "POST" || req.method === "PATCH") {
        body = (await json(req)) as { refreshToken?: string };
      }
    } catch (err) {
      process.stderr.write(
        `[refresh] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      (body.refreshToken !== undefined && typeof body.refreshToken !== "string")
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }
    const incomingRefreshToken =
      body.refreshToken || (req.headers["x-refresh-token"] as string);

    if (!incomingRefreshToken) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "No refresh token provided." }));
      return;
    }

    try {
      const hashedIncomingToken = crypto
        .createHash("sha256")
        .update(incomingRefreshToken)
        .digest("hex");
      const sessionResult =
        await authService.findRefreshTokenByHash(hashedIncomingToken);
      const session = sessionResult.rows[0];

      if (!session) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid refresh token." }));
        return;
      }

      let isGraceRetry = false;

      if (session.is_revoked) {
        const revokedReason = session.revoked_reason || "unknown";
        const revokedAtMs = session.revoked_at
          ? new Date(session.revoked_at).getTime()
          : 0;
        const msSinceRevoked = Date.now() - revokedAtMs;

        if (revokedReason === "rotated" && msSinceRevoked <= 60000) {
          // The phone used this token, we rotated it, but the response was lost on the network.
          // The phone is retrying with the OLD token within a minute. This is not theft.
          isGraceRetry = true;
          process.stderr.write(
            `[refresh] Grace-window retry accepted. userId=${session.user_id} sessionId=${session.id} msSinceRotation=${msSinceRevoked}\n`,
          );
        } else if (revokedReason === "rotated") {
          // A token that was already rotated, reused long after. Real reuse = possible theft.
          const uaForBreach = req.headers["user-agent"] || "unknown";
          process.stderr.write(
            `[SECURITY] Refresh-token reuse detected — revoking all sessions. userId=${session.user_id} sessionId=${session.id} ip=${ip} ua=${String(uaForBreach).substring(0, 120)}\n`,
          );
          await authService.revokeEntireTokenFamily(session.user_id, "breach");

          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "For your security, you were signed out of all devices. Please log in again.",
              code: "REFRESH_REUSE_DETECTED",
            }),
          );
          return;
        } else {
          // Revoked because of logout / "log out this device" / password change / breach / legacy row.
          // That is a normal ended session, NOT theft. Do not touch the user's other sessions.
          process.stderr.write(
            `[refresh] Revoked session used. reason=${revokedReason} userId=${session.user_id} sessionId=${session.id}\n`,
          );
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Your session has ended. Please log in again.",
              code: "SESSION_ENDED",
            }),
          );
          return;
        }
      }

      if (new Date(session.expires_at).getTime() < Date.now()) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Refresh token expired. Please log in again.",
          }),
        );
        return;
      }

      const userResult = await authService.findUserById(session.user_id);
      const user = userResult.rows[0] as User;

      if (!user) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "User no longer exists." }));
        return;
      }

      const newRawRefreshToken = crypto.randomBytes(64).toString("hex");
      const newHashedRefreshToken = crypto
        .createHash("sha256")
        .update(newRawRefreshToken)
        .digest("hex");

      const refreshExpiresAt = new Date(
        Date.now() + REFRESH_TOKEN_EXPIRY_MINUTES * 60 * 1000,
      );
      const userAgent = req.headers["user-agent"] || "unknown";

      if (isGraceRetry) {
        // Old token was already rotated moments ago. Just issue a fresh one.
        await authService.createRefreshToken(
          user.id,
          newHashedRefreshToken,
          refreshExpiresAt,
          userAgent,
          ip,
          session.id,
        );
      } else {
        // Revoke old + insert new in ONE transaction. If two requests race with the same
        // token, only one wins the UPDATE and the other gets rotated:false.
        const rotation = await authService.rotateRefreshToken(
          session.id,
          user.id,
          newHashedRefreshToken,
          refreshExpiresAt,
          userAgent,
          ip,
        );

        if (!rotation.rotated) {
          process.stderr.write(
            `[refresh] Rotation race lost. Another request already used this token. userId=${user.id} sessionId=${session.id}\n`,
          );
          res.statusCode = 409;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Please try again in a moment.",
              code: "REFRESH_CONFLICT",
            }),
          );
          return;
        }
      }

      const payload: JWTPayload = {
        id: user.id,
        username: user.username,
        role: user.role,
        token_use: "access",
      };
      const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, {
        expiresIn: `${ACCESS_TOKEN_EXPIRY_MINUTES}m`,
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          accessToken,
          refreshToken: newRawRefreshToken,
          user: {
            id: user.id,
            username: user.username,
            name: user.name || null,
            email: user.email || null,
            phone_number: user.phone_number || null,
            has_local_password: user.password_hash !== null,
            avatar_url: user.avatar_url || null,
            role: user.role,
          },
        }),
      );

      return;
    } catch (err) {
      process.stderr.write(
        `[refresh] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to refresh token." }));
      return;
    }
  },

  async logout(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: { refreshToken?: string } = {};
    try {
      if (req.method === "POST" || req.method === "PATCH") {
        body = (await json(req)) as { refreshToken?: string };
      }
    } catch (err) {
      process.stderr.write(
        `[logout] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      (body.refreshToken !== undefined && typeof body.refreshToken !== "string")
    ) {
      process.stderr.write(
        `[logout] Request body had an unexpected shape, ignoring it. typeof=${typeof body}\n`,
      );
      body = {};
    }

    const incomingRefreshToken =
      body.refreshToken || (req.headers["x-refresh-token"] as string);

    if (incomingRefreshToken) {
      try {
        const hashedIncomingToken = crypto
          .createHash("sha256")
          .update(incomingRefreshToken)
          .digest("hex");
        await authService.revokeRefreshTokenByHash(
          hashedIncomingToken,
          "logout",
        );
      } catch (e) {
        process.stderr.write(
          `[logout] DB Error: ${(e as Error).message}\nStack: ${(e as Error).stack}\n`,
        );
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: "Logged out successfully" }));
  },

  async updateAccount(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
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
        `[updateAccount] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
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

    const url = new URL(req.url || "/", "http://localhost");
    const targetId = url.searchParams.get("id") || decoded.id;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetId,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid target user ID format." }));
      return;
    }

    if (decoded.id !== targetId && decoded.role !== "super_admin") {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "Forbidden: Access denied." }));
      return;
    }

    let body: UpdateAccountDTO;
    try {
      body = (await json(req)) as UpdateAccountDTO;
    } catch (err) {
      process.stderr.write(
        `[updateAccount] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    try {
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid request data." }));
        return;
      }

      const { username, avatarUrl, name, phoneNumber, email, currentPassword } =
        body;

      if (
        (username !== undefined &&
          username !== null &&
          typeof username !== "string") ||
        (name !== undefined && name !== null && typeof name !== "string") ||
        (phoneNumber !== undefined &&
          phoneNumber !== null &&
          typeof phoneNumber !== "string") ||
        (email !== undefined && email !== null && typeof email !== "string") ||
        (avatarUrl !== undefined &&
          avatarUrl !== null &&
          typeof avatarUrl !== "string")
      ) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid request data." }));
        return;
      }

      const allowedAvatarHosts = [
        "res.cloudinary.com",
        "avatars.githubusercontent.com",
        "lh3.googleusercontent.com",
      ];

      // 0. Load the account being edited, so we know what REALLY changed
      let existingUser: User;
      try {
        const existingUserResult = await authService.findUserById(targetId);
        if (existingUserResult.rows.length === 0) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Account not found." }));
          return;
        }
        existingUser = existingUserResult.rows[0] as User;
      } catch (dbErr) {
        process.stderr.write(
          `[updateAccount] DB Error loading the account: ${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
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

      // 1. Process Email (format only. The password check happens in step 6)
      let finalEmail: string | null = null;
      if (email !== undefined && email !== null) {
        finalEmail = email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (finalEmail.length > 254 || !emailRegex.test(finalEmail)) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Please enter a valid email address format.",
            }),
          );
          return;
        }

        // Same as the current email = nothing to change
        if (finalEmail === existingUser.email) {
          finalEmail = null;
        }
      }

      // 2. Process Username
      let finalUsername: string | null = null;
      if (username !== undefined && username !== null) {
        finalUsername = username.toLowerCase().trim();
        if (!/^[a-z][a-z0-9_]{2,19}$/.test(finalUsername)) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error:
                "Username must be 3-20 characters, start with a letter, and only use letters, numbers and underscores.",
            }),
          );
          return;
        }
      }

      // 3. Process Phone Number
      let parsedPhone: string | null = null;
      if (phoneNumber !== undefined && phoneNumber !== null) {
        let rawPhone = phoneNumber.replace(/[\s-]/g, "");
        if (rawPhone.startsWith("07"))
          rawPhone = "+250" + rawPhone.substring(1);
        else if (rawPhone.startsWith("250")) rawPhone = "+" + rawPhone;

        if (!/^\+2507[2389]\d{7}$/.test(rawPhone)) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({ error: "Enter a valid Rwandan phone number." }),
          );
          return;
        }
        parsedPhone = rawPhone;

        // Same as the current phone number = nothing to change
        if (parsedPhone === existingUser.phone_number) {
          parsedPhone = null;
        }
      }

      // 4. Process Name
      let finalName: string | null | undefined = name;
      if (finalName !== undefined && finalName !== null) {
        finalName = finalName.trim();
        if (finalName.length > 100) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: "Name cannot exceed 100 characters.",
            }),
          );
          return;
        }
      }

      // 5. Process Avatar URL
      if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== "") {
        const trimmedUrl = avatarUrl.trim();

        if (trimmedUrl.length > 2048) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: "Avatar URL cannot exceed 2048 characters.",
            }),
          );
          return;
        }

        let parsedAvatarUrl: URL;
        try {
          parsedAvatarUrl = new URL(trimmedUrl);
        } catch (err) {
          process.stderr.write(
            `[updateAccount] URL Parsing Error for string '${trimmedUrl}': ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
          );
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: "Please enter a properly formatted URL.",
            }),
          );
          return;
        }

        if (
          parsedAvatarUrl.protocol !== "https:" ||
          !allowedAvatarHosts.includes(parsedAvatarUrl.hostname)
        ) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error:
                "Please upload your photo from the app, or use a link from Cloudinary, GitHub or Google.",
            }),
          );
          return;
        }
      }

      let finalAvatarUrl: string | null = null;
      if (avatarUrl) {
        finalAvatarUrl = avatarUrl.trim();
      }

      // 6. Changing the email address or the phone number requires the OWNER's current password.
      // (A super_admin editing someone else's account is not asked for that person's password.
      // It is written to the audit log instead.)
      if (
        (finalEmail !== null || parsedPhone !== null) &&
        decoded.id === targetId
      ) {
        if (!currentPassword || typeof currentPassword !== "string") {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "Your current password is required to change your email address or phone number.",
            }),
          );
          return;
        }

        if (existingUser.password_hash === null) {
          process.stderr.write(
            `[updateAccount] Security: Social user ${existingUser.id} attempted to change email/phone without a local password.\n`,
          );
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "Set a password on your account first. Then you can change your email address or phone number.",
            }),
          );
          return;
        }

        const passwordFailKey = `ratelimit:pwcheck:fail:user:${targetId}`;
        if (NODE_ENV !== "development") {
          try {
            const previousFailures =
              Number(await redisClient.get<number>(passwordFailKey)) || 0;
            if (previousFailures >= 5) {
              res.statusCode = 429;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error:
                    "Too many incorrect password attempts. Please try again in 15 minutes.",
                }),
              );
              return;
            }
          } catch (redisErr) {
            process.stderr.write(
              `[updateAccount] Password-attempt limiter read error: ${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
            );
          }
        }

        try {
          const passwordMatches = await argon2.verify(
            existingUser.password_hash,
            currentPassword,
          );
          if (!passwordMatches) {
            if (NODE_ENV !== "development") {
              try {
                await redisClient
                  .multi()
                  .set(passwordFailKey, 0, { ex: 900, nx: true })
                  .incr(passwordFailKey)
                  .exec();
              } catch (redisErr) {
                process.stderr.write(
                  `[updateAccount] Password-attempt limiter write error: ${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
                );
              }
            }
            process.stderr.write(
              `[updateAccount] Security: Invalid password provided during email/phone update for user ${existingUser.id}.\n`,
            );
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ error: "Your current password is incorrect." }),
            );
            return;
          }
        } catch (argonErr) {
          process.stderr.write(
            `[updateAccount] Argon2 Verify Error: ${(argonErr as Error).message}\nStack: ${(argonErr as Error).stack}\n`,
          );
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ error: "Failed to verify security credentials." }),
          );
          return;
        }
      }

      if (decoded.id !== targetId) {
        try {
          await authService.createAdminAuditLog(
            decoded.id,
            decoded.username,
            "update_account",
            `Admin updated the account of userId=${targetId}`,
          );
        } catch (auditErr) {
          process.stderr.write(
            `[updateAccount] Failed to write admin audit log: ${(auditErr as Error).message}\nStack: ${(auditErr as Error).stack}\n`,
          );
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error:
                "We couldn't record this admin action, so it was not applied. Please try again.",
            }),
          );
          return;
        }
      }

      if (
        finalUsername ||
        finalAvatarUrl !== null ||
        finalName !== undefined ||
        parsedPhone !== null ||
        finalEmail !== null
      ) {
        try {
          await authService.updateUser(
            finalUsername,
            null, // profileTitle removed
            finalAvatarUrl,
            targetId,
            finalName !== undefined ? finalName : null,
            parsedPhone !== null ? parsedPhone : null,
            finalEmail !== null ? finalEmail : null,
          );
        } catch (err) {
          const pgCode = (err as any)?.code;
          const pgConstraint = (err as any)?.constraint || "";

          if (pgCode === "23505") {
            if (pgConstraint.includes("phone_number")) {
              process.stderr.write(
                `[updateAccount] Duplicate phone on update rejected (23505) constraint=${pgConstraint}\n`,
              );
              res.statusCode = 409;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: "Phone number already taken.",
                  field: "phoneNumber",
                  code: "PHONE_TAKEN",
                }),
              );
              return;
            }

            if (pgConstraint.includes("username")) {
              process.stderr.write(
                `[updateAccount] Duplicate username on rename rejected (23505) constraint=${pgConstraint}\n`,
              );
              res.statusCode = 409;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: "Username already taken. Pick a different one.",
                  field: "username",
                  code: "USERNAME_TAKEN",
                }),
              );
              return;
            }

            if (pgConstraint.includes("email")) {
              process.stderr.write(
                `[updateAccount] Duplicate email on update rejected (23505) constraint=${pgConstraint}\n`,
              );
              res.statusCode = 409;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: "An account with that email address already exists.",
                  field: "email",
                  code: "EMAIL_TAKEN",
                }),
              );
              return;
            }
          }

          process.stderr.write(
            `[updateAccount] DB/Logic Error updating user info code=${pgCode || "n/a"} constraint=${pgConstraint || "n/a"}: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
          );
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error:
                "Failed to update profile data due to a server error. Please retry.",
            }),
          );
          return;
        }
      }

      try {
        const updatedUserResult = await authService.findUserById(targetId);

        if (updatedUserResult.rows.length === 0) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "User not found after update." }));
          return;
        }

        const user = updatedUserResult.rows[0];

        const safeUser = {
          id: user.id,
          email: user.email,
          phone_number: user.phone_number,
          username: user.username,
          name: user.name,
          avatar_url: user.avatar_url,
          role: user.role,
          created_at: user.created_at,
          updated_at: user.updated_at,
        };

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            message: "Account updated successfully.",
            user: safeUser,
          }),
        );
      } catch (err) {
        process.stderr.write(
          `[updateAccount] DB/Logic Error fetching updated user: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: "Failed to retrieve updated user profile.",
          }),
        );
        return;
      }
    } catch (err) {
      process.stderr.write(
        `[updateAccount] Unexpected Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error:
            "Account update failed due to an unexpected server error. Please retry.",
        }),
      );
    }
  },

  async uploadAvatar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
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
        `[uploadAvatar] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
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

    const url = new URL(req.url || "/", "http://localhost");
    const targetId = url.searchParams.get("id") || decoded.id;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetId,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid target user ID format." }));
      return;
    }

    if (decoded.id !== targetId && decoded.role !== "super_admin") {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "Forbidden: Access denied." }));
      return;
    }

    if (decoded.id !== targetId) {
      try {
        await authService.createAdminAuditLog(
          decoded.id,
          decoded.username,
          "update_avatar",
          `Admin changed the avatar of userId=${targetId}`,
        );
      } catch (auditErr) {
        process.stderr.write(
          `[uploadAvatar] Failed to write admin audit log: ${(auditErr as Error).message}\nStack: ${(auditErr as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "We couldn't record this admin action, so it was not applied. Please try again.",
          }),
        );
        return;
      }
    }

    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: 5 * 1024 * 1024, // the EXACT 5MB file check (file bytes only)
          fields: 2,
          fieldSize: 1024,
          parts: 4,
          headerPairs: 20,
        },
      });
    } catch (err) {
      process.stderr.write(
        `[uploadAvatar] Busboy Initialization Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid form data headers." }));
      return;
    }

    let fileFound = false;

    bb.on("file", (_name, file, info) => {
      if (fileFound) {
        file.resume();
        return;
      }
      fileFound = true;
      try {
        const { mimeType } = info;

        if (!mimeType.startsWith("image/")) {
          file.resume();
          if (!res.headersSent) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Only image files are allowed." }));
          }
          return;
        }

        file.on("limit", () => {
          process.stderr.write(
            `[uploadAvatar] File exceeded the 5MB size limit. Destroying BOTH the incoming file stream and the Cloudinary upload stream.\n`,
          );
          if (!res.headersSent) {
            res.statusCode = 413;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "That photo is too large. Please choose one under 5MB.",
              }),
            );
          }
          uploadStream.destroy();
          file.destroy();
        });

        const uploadStream = mediaStorage.uploader.upload_stream(
          {
            folder: "mastersave/profile",
            public_id: `avatar_${targetId}`,
            overwrite: true,
            invalidate: true,
            resource_type: "image",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            transformation: [
              {
                width: 512,
                height: 512,
                crop: "fill",
                gravity: "auto",
                quality: "auto",
              },
            ],
          },
          async (error, result) => {
            if (error) {
              process.stderr.write(
                `[uploadAvatar] Cloudinary Upload Stream Error: ${error.message}\nStack: ${error["stack"]}\nFull error: ${JSON.stringify(error)}\n`,
              );
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: "We couldn't upload your photo. Please try again.",
                  }),
                );
              }
              return;
            }

            if (!result || !result.secure_url) {
              process.stderr.write(
                `[uploadAvatar] Cloudinary returned no secure_url. result=${JSON.stringify(result)}\n`,
              );
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: "We couldn't upload your photo. Please try again.",
                  }),
                );
              }
              return;
            }

            // Save the new URL on the user row right here, so it survives logout/login
            try {
              const avatarUpdateResult = await authService.updateUser(
                null,
                null,
                result.secure_url,
                targetId,
              );

              if (avatarUpdateResult.rows.length === 0) {
                process.stderr.write(
                  `[uploadAvatar] No active user found while saving avatar. targetId=${targetId}\n`,
                );
                if (!res.headersSent) {
                  res.statusCode = 404;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: "Account not found." }));
                }
                return;
              }
            } catch (dbErr) {
              process.stderr.write(
                `[uploadAvatar] DB Error saving avatar_url: ${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
              );
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error:
                      "Your photo uploaded, but we couldn't save it to your profile. Please try again.",
                  }),
                );
              }
              return;
            }

            if (!res.headersSent) {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ url: result.secure_url }));
            }
          },
        );

        file.on("error", (err) => {
          process.stderr.write(
            `[uploadAvatar] Busboy File Stream Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
          );
          if ((err as Error).message === "FILE_TOO_LARGE" && !res.headersSent) {
            res.statusCode = 413;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ error: "Image exceeds the 5MB size limit." }),
            );
          }
        });

        uploadStream.on("error", (err: any) => {
          process.stderr.write(
            `[uploadAvatar] FATAL STREAM CRASH PREVENTED: ${err.message}\nStack: ${err.stack}\n`,
          );
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "Upload connection lost. Please try again.",
              }),
            );
          }
        });

        file.pipe(uploadStream);
      } catch (err) {
        process.stderr.write(
          `[uploadAvatar] Busboy File Event Processing Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ error: "Server error during file processing." }),
          );
        }
      }
    });

    bb.on("error", (err) => {
      process.stderr.write(
        `[uploadAvatar] Busboy Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Form parsing failed." }));
      }
    });

    bb.on("finish", () => {
      if (!fileFound && !res.headersSent) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ error: "No image file provided in the request." }),
        );
      }
    });

    try {
      req.pipe(bb);
    } catch (err) {
      process.stderr.write(
        `[uploadAvatar] Request Pipe Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Failed to read request body." }));
      }
    }
  },

  async deleteAccount(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
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
        `[deleteAccount] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\n`,
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

    const url = new URL(req.url || "/", "http://localhost");
    const targetId = url.searchParams.get("id") || decoded.id;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetId,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid target user ID format." }));
      return;
    }

    if (decoded.id !== targetId && decoded.role !== "super_admin") {
      res.statusCode = 403;
      res.end(
        JSON.stringify({
          error:
            "Forbidden: Only the owner or a Super Admin can delete this account.",
        }),
      );
      return;
    }

    try {
      // Money first: deleting an account must never strand a balance or a deposit in flight
      const deletionBlockers =
        await financeService.getAccountDeletionBlockers(targetId);
      if (
        deletionBlockers &&
        (Number(deletionBlockers.total_balance) > 0 ||
          deletionBlockers.pending_deposits > 0)
      ) {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "This account still has money or a deposit in progress. Withdraw your balance and wait for pending deposits to finish before deleting.",
            code: "ACCOUNT_HAS_FUNDS",
          }),
        );
        return;
      }

      if (decoded.id !== targetId) {
        await authService.createAdminAuditLog(
          decoded.id,
          decoded.username,
          "delete_account",
          `Admin deleted the account of userId=${targetId}`,
        );
      }
      // Revoke sessions first, then soft-delete the user
      await authService.revokeAllUserRefreshTokens(targetId, "account_deleted");
      await authService.deleteUser(targetId);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Account deleted" }));
    } catch (err) {
      process.stderr.write(
        `[deleteAccount] DB/Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Deletion failed" }));
    }
  },

  async socialLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: any;
    try {
      body = (await json(req)) as any;
    } catch (err) {
      process.stderr.write(
        `[socialLogin] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
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

    const { provider, token } = body;

    if (!provider || provider !== "google") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid or missing provider." }));
      return;
    }

    let email: string = "";
    let name: string = "";
    let avatarUrl: string = "";
    let providerId: string = "";

    if (!token || typeof token !== "string") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing Google ID token." }));
      return;
    }

    if (GOOGLE_CLIENT_IDS.length === 0) {
      process.stderr.write(
        "[socialLogin] Fatal: GOOGLE_CLIENT_IDS / GOOGLE_CLIENT_ID is missing in environment variables.\n",
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Google sign-in is temporarily unavailable. Please try again later.",
        }),
      );
      return;
    }

    try {
      const ticket = (await googleOAuthClient.verifyIdToken({
        idToken: token,
        audience: GOOGLE_CLIENT_IDS,
      })) as any;

      const payload = ticket.getPayload();

      if (!payload || !payload.email) {
        throw new Error("Google token payload did not contain an email.");
      }

      if (payload.email_verified !== true) {
        process.stderr.write(
          `[socialLogin] Google email not verified. sub=${payload.sub}\n`,
        );
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "Your Google email address isn't verified. Please verify it with Google and try again.",
          }),
        );
        return;
      }
      // Our app signs out of Google before every sign-in, so a real token is always brand new.
      // Rejecting anything older than 5 minutes shrinks the replay window from 1 hour to 5 minutes.
      const googleTokenAgeSeconds =
        Math.floor(Date.now() / 1000) - Number(payload.iat);
      // "!(x <= 300)" also rejects a missing / NaN issue time
      if (!(googleTokenAgeSeconds <= 300)) {
        process.stderr.write(
          `[socialLogin] Google token too old. ageSeconds=${googleTokenAgeSeconds} sub=${payload.sub}\n`,
        );
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Your Google sign-in expired. Please try again.",
          }),
        );
        return;
      }

      // Single use: remember a fingerprint of every accepted token for 10 minutes.
      // 600 seconds is longer than the 300 second age limit above, so a token can never
      // be accepted again while it is still young enough to pass the age check.
      if (NODE_ENV !== "development") {
        try {
          const googleTokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

          const firstUse = await redisClient.set(
            `google:token:used:${googleTokenHash}`,
            "1",
            { ex: 600, nx: true },
          );

          // SET ... NX returns null when the key already exists = this token was already used
          if (firstUse === null) {
            process.stderr.write(
              `[SECURITY] Google token replay blocked. sub=${payload.sub}\n`,
            );
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "Your Google sign-in expired. Please try again.",
              }),
            );
            return;
          }
        } catch (redisErr) {
          process.stderr.write(
            `[socialLogin] Google token replay check error, login allowed: ${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
          );
        }
      }

      email = String(payload.email).toLowerCase().trim();
      name = payload.name || "";
      avatarUrl = payload.picture || DEFAULT_AVATAR_URL;
      providerId = payload.sub;
    } catch (err) {
      process.stderr.write(
        `[socialLogin] Google Token Verification Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid Google token." }));
      return;
    }

    let user: any = null;
    let isNewUser = false;

    try {
      const providerUserResult = await authService.findUserByProvider(
        provider,
        providerId,
      );
      if (providerUserResult.rows.length > 0) {
        user = providerUserResult.rows[0];
      }
    } catch (err) {
      process.stderr.write(
        `[socialLogin] DB Error looking up user by provider id: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't log you in right now. Please try again.",
        }),
      );
      return;
    }

    try {
      // If the provider-id lookup above already found the user, skip the email lookup
      const existingUserResult =
        user === null
          ? await authService.findUserByEmail(email)
          : { rows: [] as any[] };
      if (existingUserResult.rows.length > 0) {
        user = existingUserResult.rows[0];

        if (user.auth_provider !== provider) {
          process.stderr.write(
            `[socialLogin BOUNCER] Collision blocked: userId=${user.id} attempted to login via ${provider}, but the account is registered to ${user.auth_provider}.\n`,
          );

          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");

          let errorMessage = `An account with this email already exists via ${user.auth_provider}. Please sign in using your original method.`;

          if (user.auth_provider === "local") {
            errorMessage =
              "An account with this email already exists using a password. Please log in locally.";
          }

          res.end(JSON.stringify({ error: errorMessage }));
          return;
        }

        if (user.provider_id && user.provider_id !== providerId) {
          process.stderr.write(
            `[SECURITY] Provider ID mismatch for userId=${user.id}.\n`,
          );
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "Security alert: Social account mismatch. Please contact support.",
            }),
          );
          return;
        }
      }
    } catch (err) {
      process.stderr.write(
        `[socialLogin] DB Error checking existing email: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Database error during login." }));
      return;
    }

    if (!user) {
      isNewUser = true;

      const cleanName = name.length > 100 ? name.substring(0, 100) : name;
      const emailParts = email.split("@");
      const emailPrefix = emailParts[0];

      if (!emailPrefix) {
        process.stderr.write(
          `[socialLogin] Fatal Logic Error: email.split("@") returned undefined for the Google email\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Failed to parse email address during account creation.",
          }),
        );
        return;
      }

      let baseUsername = emailPrefix.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (baseUsername.length < 3) {
        baseUsername = baseUsername + "user";
      }
      // A username must start with a letter, so it can never look like a phone number
      if (!/^[a-z]/.test(baseUsername)) {
        baseUsername = "user" + baseUsername;
      }
      // 14 chars + 6 random hex = 20 max, which is the database limit
      if (baseUsername.length > 14) {
        baseUsername = baseUsername.substring(0, 14);
      }

      let finalUsername = baseUsername;
      let attempt = 0;
      let success = false;

      while (attempt < 5 && !success) {
        try {
          const insertResult = await authService.createSocialUser(
            email,
            finalUsername,
            cleanName,
            avatarUrl,
            provider,
            providerId,
          );
          user = insertResult.rows[0];
          success = true;
        } catch (err: any) {
          const pgCode = err?.code;
          const pgConstraint = err?.constraint || "";

          if (pgCode === "23505" && pgConstraint.includes("username")) {
            process.stderr.write(
              `[socialLogin] Username collision for ${finalUsername}. Generating new suffix...\n`,
            );
            finalUsername =
              baseUsername + crypto.randomBytes(3).toString("hex");
            attempt++;
          } else if (pgCode === "23505") {
            process.stderr.write(
              `[socialLogin] Non-username unique constraint hit (constraint=${pgConstraint}) during social user creation, likely a concurrent duplicate signup: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
            );
            res.statusCode = 409;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error:
                  "An account with this email was just created. Please try logging in again.",
              }),
            );
            return;
          } else {
            process.stderr.write(
              `[socialLogin] Fatal DB error during social user creation: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
            );
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "Failed to create your account due to a server error.",
              }),
            );
            return;
          }
        }
      }

      if (!success) {
        process.stderr.write(
          `[socialLogin] Failed to generate a unique username after 5 attempts (base=${baseUsername}).\n`,
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Could not generate a unique username. Please try again.",
          }),
        );
        return;
      }
    }

    try {
      const rawRefreshToken = crypto.randomBytes(64).toString("hex");
      const hashedRefreshToken = crypto
        .createHash("sha256")
        .update(rawRefreshToken)
        .digest("hex");

      const refreshExpiresAt = new Date(
        Date.now() + REFRESH_TOKEN_EXPIRY_MINUTES * 60 * 1000,
      );
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
      const userAgent = req.headers["user-agent"] || "unknown";

      await authService.createRefreshToken(
        user.id,
        hashedRefreshToken,
        refreshExpiresAt,
        userAgent,
        ip,
        null,
      );

      const payload: JWTPayload = {
        id: user.id,
        username: user.username,
        role: user.role,
        token_use: "access",
      };

      const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, {
        expiresIn: `${ACCESS_TOKEN_EXPIRY_MINUTES}m`,
      });

      // `user` already has every column we need (provider lookup, email lookup and
      // createSocialUser all return the full row), so no extra database query here.
      const fullUser = user;

      res.statusCode = isNewUser ? 201 : 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          accessToken,
          refreshToken: rawRefreshToken, // FOR EXPO SECURE STORE
          user: {
            id: fullUser.id,
            username: fullUser.username,
            name: fullUser.name || null,
            email: fullUser.email || null,
            phone_number: fullUser.phone_number || null,
            has_local_password: fullUser.password_hash !== null,
            avatar_url: fullUser.avatar_url || null,
            role: fullUser.role,
          },
        }),
      );
    } catch (err) {
      process.stderr.write(
        `[socialLogin] Token Generation/DB Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to finalize login session." }));
    }
  },

  async changePassword(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
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
        `[changePassword] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\n`,
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

    const url = new URL(req.url || "/", "http://localhost");
    const targetId = url.searchParams.get("id") || decoded.id;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetId,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid target user ID format." }));
      return;
    }

    if (decoded.id !== targetId && decoded.role !== "super_admin") {
      res.statusCode = 403;
      res.end(
        JSON.stringify({
          error: "Forbidden: You can only change your own password.",
        }),
      );
      return;
    }

    let body: ChangePasswordDTO;
    try {
      body = (await json(req)) as ChangePasswordDTO;
    } catch (err) {
      process.stderr.write(
        `[changePassword] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }

    try {
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        (body.currentPassword !== undefined &&
          typeof body.currentPassword !== "string") ||
        (body.newPassword !== undefined &&
          typeof body.newPassword !== "string") ||
        (body.confirmPassword !== undefined &&
          typeof body.confirmPassword !== "string") ||
        (body.googleToken !== undefined &&
          typeof body.googleToken !== "string") ||
        (body.refreshToken !== undefined &&
          typeof body.refreshToken !== "string")
      ) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid request data." }));
        return;
      }

      const { currentPassword, newPassword, confirmPassword } = body;
      if (!newPassword || newPassword.length < 6 || newPassword.length > 50) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: "New password must be 6-50 characters." }),
        );
        return;
      }

      if (newPassword !== confirmPassword) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "New passwords do not match." }));
        return;
      }

      let user: User;
      try {
        const userResult = await authService.findUserById(targetId);
        user = userResult.rows[0] as User;
      } catch (err) {
        process.stderr.write(
          `[changePassword] DB Error fetching user: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Failed to fetch user record." }));
        return;
      }
      if (!user) {
        process.stderr.write(
          `[changePassword] No active user found for targetId=${targetId}\n`,
        );
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Account not found." }));
        return;
      }

      // The OWNER of the account always proves who they are.
      // (A super_admin changing SOMEONE ELSE's password skips this and is audit-logged below.)
      if (decoded.id === targetId) {
        if (user.password_hash === null) {
          // A Google account is setting its FIRST password. A stolen access token must NOT be
          // enough for this, so we require a fresh Google sign-in: a Google ID token that
          // belongs to THIS account and was issued in the last 5 minutes.
          const googleToken = body.googleToken;

          if (!googleToken) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error:
                  "Please confirm with Google to set a password on your account.",
                code: "GOOGLE_REAUTH_REQUIRED",
              }),
            );
            return;
          }

          if (user.auth_provider !== "google" || !user.provider_id) {
            process.stderr.write(
              `[changePassword] Account ${user.id} has no password but is not a linked Google account. auth_provider=${user.auth_provider}\n`,
            );
            res.statusCode = 403;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error:
                  "We couldn't verify your account. Please contact support.",
              }),
            );
            return;
          }

          try {
            const googleTicket = (await googleOAuthClient.verifyIdToken({
              idToken: googleToken,
              audience: GOOGLE_CLIENT_IDS,
            })) as any;
            const googlePayload = googleTicket.getPayload();

            if (!googlePayload || googlePayload.sub !== user.provider_id) {
              process.stderr.write(
                `[SECURITY] changePassword Google token does not belong to this account. userId=${user.id}\n`,
              );
              res.statusCode = 403;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: "That Google account doesn't match this account.",
                  code: "GOOGLE_REAUTH_REQUIRED",
                }),
              );
              return;
            }

            const tokenAgeSeconds =
              Math.floor(Date.now() / 1000) - Number(googlePayload.iat);
            // "!(x <= 300)" also rejects a missing / NaN issue time
            if (!(tokenAgeSeconds <= 300)) {
              process.stderr.write(
                `[changePassword] Google token too old. ageSeconds=${tokenAgeSeconds} userId=${user.id}\n`,
              );
              res.statusCode = 401;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: "Please confirm with Google again, then retry.",
                  code: "GOOGLE_REAUTH_REQUIRED",
                }),
              );
              return;
            }

            // Single use: the same fingerprint list as socialLogin (same Redis key prefix), so a
            // token that was already used to LOG IN can never also be used to SET A PASSWORD,
            // and the other way round. Kept 600 seconds, which is longer than the 300 second age limit.
            if (NODE_ENV !== "development") {
              try {
                const googleTokenHash = crypto
                  .createHash("sha256")
                  .update(googleToken)
                  .digest("hex");

                const firstUse = await redisClient.set(
                  `google:token:used:${googleTokenHash}`,
                  "1",
                  { ex: 600, nx: true },
                );

                // SET ... NX returns null when the key already exists = this token was already used
                if (firstUse === null) {
                  process.stderr.write(
                    `[SECURITY] changePassword Google token replay blocked. userId=${user.id}\n`,
                  );
                  res.statusCode = 401;
                  res.setHeader("Content-Type", "application/json");
                  res.end(
                    JSON.stringify({
                      error: "Please confirm with Google again, then retry.",
                      code: "GOOGLE_REAUTH_REQUIRED",
                    }),
                  );
                  return;
                }
              } catch (redisErr) {
                process.stderr.write(
                  `[changePassword] Google token replay check error, request allowed: ${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
                );
              }
            }
          } catch (googleErr) {
            process.stderr.write(
              `[changePassword] Google Token Verification Error: ${(googleErr as Error).message}\nStack: ${(googleErr as Error).stack}\n`,
            );
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error:
                  "We couldn't confirm your Google account. Please try again.",
                code: "GOOGLE_REAUTH_REQUIRED",
              }),
            );
            return;
          }
        } else {
          if (!currentPassword) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                error: "Current password is required to change it.",
              }),
            );
            return;
          }

          const passwordFailKey = `ratelimit:pwcheck:fail:user:${targetId}`;
          if (NODE_ENV !== "development") {
            try {
              const previousFailures =
                Number(await redisClient.get<number>(passwordFailKey)) || 0;
              if (previousFailures >= 5) {
                res.statusCode = 429;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error:
                      "Too many incorrect password attempts. Please try again in 15 minutes.",
                  }),
                );
                return;
              }
            } catch (redisErr) {
              process.stderr.write(
                `[changePassword] Password-attempt limiter read error: ${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
              );
            }
          }

          try {
            const isValid = await argon2.verify(
              user.password_hash,
              currentPassword,
            );
            if (!isValid) {
              if (NODE_ENV !== "development") {
                try {
                  await redisClient
                    .multi()
                    .set(passwordFailKey, 0, { ex: 900, nx: true })
                    .incr(passwordFailKey)
                    .exec();
                } catch (redisErr) {
                  process.stderr.write(
                    `[changePassword] Password-attempt limiter write error: ${(redisErr as Error).message}\nStack: ${(redisErr as Error).stack}\n`,
                  );
                }
              }
              res.statusCode = 401;
              res.end(
                JSON.stringify({
                  error: "Your current password is incorrect.",
                }),
              );
              return;
            }
          } catch (argonVerifyErr) {
            process.stderr.write(
              `[changePassword] Argon2 Verify Error: ${(argonVerifyErr as Error).message}\nStack: ${(argonVerifyErr as Error).stack}\n`,
            );
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error:
                  "Failed to verify current password due to a server error.",
              }),
            );
            return;
          }
        }
      }

      let newHash: string;
      try {
        newHash = await argon2.hash(newPassword);
      } catch (argonHashErr) {
        process.stderr.write(
          `[changePassword] Argon2 Hash Error: ${(argonHashErr as Error).message}\nStack: ${(argonHashErr as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.end(
          JSON.stringify({ error: "Failed to securely hash new password." }),
        );
        return;
      }
      const currentRefreshToken =
        (req.headers["x-refresh-token"] as string) || body.refreshToken || "";
      let hashedCurrentToken = "";

      if (currentRefreshToken) {
        try {
          hashedCurrentToken = crypto
            .createHash("sha256")
            .update(currentRefreshToken)
            .digest("hex");
        } catch (cryptoErr) {
          process.stderr.write(
            `[changePassword] Crypto Hash Error: ${(cryptoErr as Error).message}\nStack: ${(cryptoErr as Error).stack}\n`,
          );
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: "Failed to process current session security token.",
            }),
          );
          return;
        }
      }

      try {
        if (decoded.id !== targetId) {
          await authService.createAdminAuditLog(
            decoded.id,
            decoded.username,
            "change_password",
            `Admin changed the password of userId=${targetId}`,
          );
        }

        await authService.updatePassword(newHash, targetId);

        if (hashedCurrentToken) {
          await authService.revokeOtherRefreshTokens(
            targetId,
            hashedCurrentToken,
            "password_change",
          );
        } else {
          await authService.revokeAllUserRefreshTokens(
            targetId,
            "password_change",
          );
        }
      } catch (dbErr) {
        process.stderr.write(
          `[changePassword] DB Error updating password or clearing tokens: ${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
        );
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: "Failed to update password at the database level.",
          }),
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message:
            "Password updated successfully. All other sessions logged out.",
        }),
      );
    } catch (err) {
      process.stderr.write(
        `[changePassword] Unexpected Logic Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Change password failed" }));
    }
  },

  async getSessions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
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
        `[getSessions] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
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

    const currentRefreshToken =
      (req.headers["x-refresh-token"] as string) || "";
    let currentSessionId = "";

    if (currentRefreshToken) {
      let hashedCurrentToken = "";
      try {
        hashedCurrentToken = crypto
          .createHash("sha256")
          .update(currentRefreshToken)
          .digest("hex");
      } catch (cryptoErr) {
        process.stderr.write(
          `[getSessions] Crypto Hash Error: ${(cryptoErr as Error).message}\nStack: ${(cryptoErr as Error).stack}\n`,
        );
      }

      if (hashedCurrentToken) {
        try {
          const sessionResult =
            await authService.findRefreshTokenByHash(hashedCurrentToken);
          if (sessionResult.rows.length > 0) {
            currentSessionId = sessionResult.rows[0].id;
          }
        } catch (dbErr) {
          process.stderr.write(
            `[getSessions] DB Error fetching current session ID: ${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
          );
        }
      }
    }

    try {
      const sessionsResult = await authService.getActiveSessionsByUserId(
        decoded.id,
      );

      const mappedSessions = sessionsResult.rows.map((row: any) => {
        return {
          id: row.id,
          user_agent: row.user_agent,
          ip_address: row.ip_address,
          created_at: row.created_at,
          is_current_session: row.id === currentSessionId,
        };
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ sessions: mappedSessions }));
    } catch (dbErr) {
      process.stderr.write(
        `[getSessions] DB Error fetching sessions list: ${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to retrieve active sessions." }));
    }
  },

  async revokeSpecificSession(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
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
        `[revokeSpecificSession] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
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

    let body: RevokeSpecificSessionDTO;
    try {
      body = (await json(req)) as RevokeSpecificSessionDTO;
    } catch (err) {
      process.stderr.write(
        `[revokeSpecificSession] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON format." }));
      return;
    }
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      (body.sessionId !== undefined && typeof body.sessionId !== "string")
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request data." }));
      return;
    }
    const sessionId = body.sessionId;
    if (!sessionId) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Session ID is required." }));
      return;
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sessionId,
      )
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid session." }));
      return;
    }

    try {
      const revokeResult = await authService.revokeSessionForUser(
        sessionId,
        decoded.id,
        "user_revoked",
      );

      if (revokeResult.rows.length === 0) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error:
              "That device is already logged out or doesn't belong to you.",
          }),
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Device logged out." }));
    } catch (dbErr) {
      process.stderr.write(
        `[revokeSpecificSession] DB Error revoking session: ${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "We couldn't log out that device. Please try again.",
        }),
      );
    }
  },

  async revokeAllOtherSessions(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.statusCode = 401;
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
        `[revokeAllOtherSessions] JWT Verify Error name=${jwtErrName} expired=${isExpired} invalid=${isInvalidSignature}: ${jwtErrMsg}\nStack: ${(err as Error).stack}\n`,
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

    let body: { refreshToken?: string } = {};
    try {
      body = (await json(req)) as { refreshToken?: string };
    } catch (err) {
      process.stderr.write(
        `[revokeAllOtherSessions] JSON Parse Error: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      (body.refreshToken !== undefined && typeof body.refreshToken !== "string")
    ) {
      process.stderr.write(
        `[revokeAllOtherSessions] Request body had an unexpected shape, ignoring it. typeof=${typeof body}\n`,
      );
      body = {};
    }

    const currentRefreshToken =
      body.refreshToken || (req.headers["x-refresh-token"] as string) || "";

    if (!currentRefreshToken) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Current refresh token is missing in body or headers. Cannot perform relative logout.",
        }),
      );
      return;
    }

    let hashedCurrentToken = "";
    try {
      hashedCurrentToken = crypto
        .createHash("sha256")
        .update(currentRefreshToken)
        .digest("hex");
    } catch (cryptoErr) {
      process.stderr.write(
        `[revokeAllOtherSessions] Crypto Hash Error: ${(cryptoErr as Error).message}\nStack: ${(cryptoErr as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Failed to process current session security token.",
        }),
      );
      return;
    }

    try {
      await authService.revokeOtherRefreshTokens(
        decoded.id,
        hashedCurrentToken,
        "user_revoked",
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          message: "All other sessions have been logged out successfully.",
        }),
      );
    } catch (dbErr) {
      process.stderr.write(
        `[revokeAllOtherSessions] DB Error deleting other sessions: ${(dbErr as Error).message}\nStack: ${(dbErr as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Failed to revoke other sessions at the database level.",
        }),
      );
    }
  },
};

//src/features/auth/auth.routes.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { authController } from "./auth.controller.js";

export const authRoutes = async ({
  req,
  res,
  pathname,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
}): Promise<boolean> => {
  if (pathname === "/api/v1/auth/ban-check" && req.method === "GET") {
    await authController.banCheck(req, res);
    return true;
  }

  if (pathname === "/api/v1/auth/signup" && req.method === "POST") {
    await authController.signup(req, res);
    return true;
  }

  if (pathname === "/api/v1/auth/login" && req.method === "POST") {
    await authController.login(req, res);
    return true;
  }

  if (pathname === "/api/v1/auth/social-login" && req.method === "POST") {
    await authController.socialLogin(req, res);
    return true;
  }

  if (
    pathname === "/api/v1/auth/refresh" &&
    (req.method === "POST" || req.method === "PATCH")
  ) {
    await authController.refresh(req, res);
    return true;
  }

  if (
    pathname === "/api/v1/auth/logout" &&
    (req.method === "POST" || req.method === "PATCH")
  ) {
    await authController.logout(req, res);
    return true;
  }

  if (pathname === "/api/v1/auth/change-password" && req.method === "PATCH") {
    await authController.changePassword(req, res);
    return true;
  }

  if (pathname === "/api/v1/auth/update" && req.method === "PATCH") {
    await authController.updateAccount(req, res);
    return true;
  }

  if (pathname === "/api/v1/auth/upload-avatar" && req.method === "POST") {
    await authController.uploadAvatar(req, res);
    return true;
  }

  if (pathname === "/api/v1/auth/delete" && req.method === "DELETE") {
    await authController.deleteAccount(req, res);
    return true;
  }

  if (pathname === "/api/v1/auth/sessions" && req.method === "GET") {
    try {
      await authController.getSessions(req, res);
    } catch (err) {
      process.stderr.write(
        `[authRoutes] Uncaught Router Error in getSessions: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
    return true;
  }

  if (pathname === "/api/v1/auth/sessions/revoke" && req.method === "POST") {
    try {
      await authController.revokeSpecificSession(req, res);
    } catch (err) {
      process.stderr.write(
        `[authRoutes] Uncaught Router Error in revokeSpecificSession: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
    return true;
  }

  if (
    pathname === "/api/v1/auth/sessions/revoke-others" &&
    req.method === "POST"
  ) {
    try {
      await authController.revokeAllOtherSessions(req, res);
    } catch (err) {
      process.stderr.write(
        `[authRoutes] Uncaught Router Error in revokeAllOtherSessions: ${(err as Error).message}\nStack: ${(err as Error).stack}\n`,
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
    return true;
  }

  return false;
};

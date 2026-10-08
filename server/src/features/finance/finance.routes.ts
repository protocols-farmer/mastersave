import type { IncomingMessage, ServerResponse } from "node:http";
import { financeController } from "./finance.controller.js";

export const financeRoutes = async ({
  req,
  res,
  pathname,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
}): Promise<boolean> => {
  if (pathname === "/api/v1/finance/dashboard" && req.method === "GET") {
    await financeController.getDashboard(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/rules" && req.method === "PATCH") {
    await financeController.updateRules(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/deposit" && req.method === "POST") {
    await financeController.triggerDeposit(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/spend" && req.method === "POST") {
    await financeController.spendMoney(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/goals" && req.method === "GET") {
    await financeController.getGoals(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/goals" && req.method === "POST") {
    await financeController.createGoal(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/goals" && req.method === "PATCH") {
    await financeController.renameGoal(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/goals" && req.method === "DELETE") {
    await financeController.deleteGoal(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/goals/withdraw" && req.method === "POST") {
    await financeController.withdrawFromGoal(req, res);
    return true;
  }
  if (
    pathname === "/api/v1/finance/goals/withdrawal-requests" &&
    req.method === "POST"
  ) {
    await financeController.manageWithdrawalRequest(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/undecided/move" && req.method === "POST") {
    await financeController.moveUndecided(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/deposit/status" && req.method === "GET") {
    await financeController.getDepositStatus(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/transactions" && req.method === "GET") {
    await financeController.getTransactions(req, res);
    return true;
  }
  if (pathname === "/api/v1/finance/webhook" && req.method === "POST") {
    await financeController.flutterwaveWebhook(req, res);
    return true;
  }

  return false;
};

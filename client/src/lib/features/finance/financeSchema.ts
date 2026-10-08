//src/lib/features/finance/financeSchema.ts
import { z } from "zod";

export const updateRulesSchema = z
  .object({
    spendPercentage: z
      .number({ invalid_type_error: "Spend percentage must be a number" })
      .int("Must be a whole number")
      .min(0, "Spend cannot be negative")
      .max(100, "Spend cannot exceed 100%"),
    savePercentage: z
      .number({ invalid_type_error: "Save percentage must be a number" })
      .int("Must be a whole number")
      .min(0, "Save cannot be negative")
      .max(100, "Save cannot exceed 100%"),
    growPercentage: z
      .number({ invalid_type_error: "Grow percentage must be a number" })
      .int("Must be a whole number")
      .min(0, "Grow cannot be negative")
      .max(100, "Grow cannot exceed 100%"),
  })
  .refine(
    (data) =>
      data.spendPercentage + data.savePercentage + data.growPercentage === 100,
    {
      message: "Total allocation must equal exactly 100%",
      path: ["spendPercentage"],
    },
  );

export const triggerDepositSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Amount must be a number" })
    .positive("Deposit amount must be greater than 0")
    .min(100, "Minimum deposit is 100 RWF"),
  phoneNumber: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .transform((val) => {
      let raw = val.replace(/[\s-]/g, "");
      if (raw.startsWith("07")) raw = "+250" + raw.substring(1);
      else if (raw.startsWith("250")) raw = "+" + raw;
      return raw;
    })
    .refine((val) => /^\+2507[2389]\d{7}$/.test(val), {
      message: "Please enter a valid Rwandan MTN or Airtel phone number",
    }),
  email: z
    .string()
    .trim()
    .email("Please provide a valid email address")
    .optional()
    .or(z.literal("")),
});

export const spendMoneySchema = z.object({
  amount: z
    .number({ invalid_type_error: "Amount must be a number" })
    .positive("Withdrawal amount must be greater than 0")
    .min(100, "Minimum withdrawal is 100 RWF"),
});

export const saveMoneySchema = z.object({
  amount: z
    .number({ invalid_type_error: "Amount must be a number" })
    .positive("Withdrawal amount must be greater than 0")
    .min(100, "Minimum withdrawal is 100 RWF"),
  agreeToPenalty: z.boolean(),
});

export const growMoneySchema = z.object({
  amount: z
    .number({ invalid_type_error: "Amount must be a number" })
    .positive("Withdrawal amount must be greater than 0")
    .min(100, "Minimum withdrawal is 100 RWF"),
  breakLock: z.boolean(),
});

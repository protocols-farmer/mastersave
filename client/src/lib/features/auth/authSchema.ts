// src/lib/features/auth/authSchema.ts
import { z } from "zod";

// Reusable regex matching your backend's allowed image formats
const imageExtensions = /\.(jpeg|jpg|gif|png|webp|avif|svg)(\?.*)?(#.*)?$/i;

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Please enter your email, username, or phone number."),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters.")
    .max(50, "Password cannot exceed 50 characters."),
});

export const signupSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .email("Please enter a valid email address."),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters.")
      .max(50, "Password cannot exceed 50 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"], // This attaches the error directly to the confirmPassword field
  });

export const updateAccountSchema = z.object({
  name: z
    .string()
    .max(100, "Name cannot exceed 100 characters.")
    .optional()
    .transform((val) => (val?.trim() === "" ? undefined : val?.trim())),

  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username cannot exceed 20 characters.")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      "Username must start with a letter and can only use letters, numbers and underscores.",
    )
    .optional(),

  phoneNumber: z
    .string()
    .optional()
    .transform((val) => (val?.trim() === "" ? undefined : val?.trim())),

  email: z
    .string()
    .email("Please enter a valid email address.")
    .optional()
    .or(z.literal("")),

  // Required dynamically by the backend if the email field is modified
  currentPassword: z.string().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters.")
      .max(50, "New password cannot exceed 50 characters."),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  });

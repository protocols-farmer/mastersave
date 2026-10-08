// src/config/env.ts

// 1. FIRST: Run your validation check using the raw process.env values
const missingVariables: string[] = [];

if (!process.env["CLIENT_URL"]) missingVariables.push("CLIENT_URL");
if (!process.env["DATABASE_URL"]) missingVariables.push("DATABASE_URL");
if (!process.env["UPSTASH_REDIS_REST_URL"])
  missingVariables.push("UPSTASH_REDIS_REST_URL");
if (!process.env["UPSTASH_REDIS_REST_TOKEN"])
  missingVariables.push("UPSTASH_REDIS_REST_TOKEN");
if (!process.env["ACCESS_TOKEN_SECRET"])
  missingVariables.push("ACCESS_TOKEN_SECRET");
if (!process.env["GOOGLE_CLIENT_ID"]) missingVariables.push("GOOGLE_CLIENT_ID");
if (!process.env["CLOUDINARY_CLOUD_NAME"])
  missingVariables.push("CLOUDINARY_CLOUD_NAME");
if (!process.env["CLOUDINARY_API_KEY"])
  missingVariables.push("CLOUDINARY_API_KEY");
if (!process.env["CLOUDINARY_API_SECRET"])
  missingVariables.push("CLOUDINARY_API_SECRET");
if (!process.env["FLUTTERWAVE_SECRET_KEY"])
  missingVariables.push("FLUTTERWAVE_SECRET_KEY");
if (!process.env["FLUTTERWAVE_WEBHOOK_HASH"])
  missingVariables.push("FLUTTERWAVE_WEBHOOK_HASH");

if (missingVariables.length > 0) {
  process.stderr.write(
    JSON.stringify({
      level: "FATAL",
      message: "Server failed to start due to missing environment variables.",
      missing_variables: missingVariables,
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
  process.exit(1);
}

// 2. SECOND: Now export them with '!' safely because you guaranteed they exist above
export const PORT = process.env["PORT"] || "5000";
export const HOST = process.env["HOST"] || "0.0.0.0";
export const NODE_ENV = process.env["NODE_ENV"] || "development";

export const CLIENT_URL = process.env["CLIENT_URL"]!;
export const DATABASE_URL = process.env["DATABASE_URL"]!;
export const UPSTASH_REDIS_REST_URL = process.env["UPSTASH_REDIS_REST_URL"]!;
export const UPSTASH_REDIS_REST_TOKEN =
  process.env["UPSTASH_REDIS_REST_TOKEN"]!;
export const ACCESS_TOKEN_SECRET = process.env["ACCESS_TOKEN_SECRET"]!;
export const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"]!;
export const CLOUDINARY_CLOUD_NAME = process.env["CLOUDINARY_CLOUD_NAME"]!;
export const CLOUDINARY_API_KEY = process.env["CLOUDINARY_API_KEY"]!;
export const CLOUDINARY_API_SECRET = process.env["CLOUDINARY_API_SECRET"]!;

export const FLUTTERWAVE_SECRET_KEY = process.env["FLUTTERWAVE_SECRET_KEY"]!;
export const FLUTTERWAVE_WEBHOOK_HASH =
  process.env["FLUTTERWAVE_WEBHOOK_HASH"]!;

export const ACCESS_TOKEN_EXPIRY_MINUTES = parseInt(
  process.env["ACCESS_TOKEN_EXPIRY_MINUTES"] || "15",
  10,
);

export const REFRESH_TOKEN_EXPIRY_MINUTES = parseInt(
  process.env["REFRESH_TOKEN_EXPIRY_MINUTES"] || "10080",
  10,
);

// How long a student waits before claiming money from a locked goal. 1440 = 24 hours. Use 1 or 2 for demos.
export const WITHDRAWAL_COOLDOWN_MINUTES = parseInt(
  process.env["WITHDRAWAL_COOLDOWN_MINUTES"] || "1440",
  10,
);

// Look, no '!' needed here anymore because CLIENT_URL is already typed as a string!
export const ALLOWED_ORIGINS = CLIENT_URL.split(",").map((o) => o.trim());

// 1 = your app sits behind exactly ONE proxy (Render, Railway, Nginx...). 0 = exposed directly.
export const TRUSTED_PROXY_COUNT = parseInt(
  process.env["TRUSTED_PROXY_COUNT"] || "1",
  10,
);

// Comma separated: web client ID, Android client ID, iOS client ID.
// Falls back to your existing single GOOGLE_CLIENT_ID.
export const GOOGLE_CLIENT_IDS = (
  process.env["GOOGLE_CLIENT_IDS"] ||
  process.env["GOOGLE_CLIENT_ID"] ||
  ""
)
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

export const DEFAULT_AVATAR_URL =
  process.env["DEFAULT_AVATAR_URL"] ||
  "https://res.cloudinary.com/dhr9zmb3i/image/upload/v1782114895/avatar-fallback_jnzqae.jpg";

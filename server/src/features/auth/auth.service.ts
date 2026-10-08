//src/features/auth/auth.service.ts
import { pool } from "../../db/psql.js";

export const authService = {
  async signup(
    email: string,
    username: string,
    name: string,
    hash: string,
    avatarUrl: string,
  ) {
    const sql = `
      INSERT INTO users (email, username, name, password_hash, avatar_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, username, name, role, created_at;
    `;
    try {
      return await pool.query(sql, [email, username, name, hash, avatarUrl]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - signup]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async findUserByPhone(phoneNumber: string) {
    const sql = `
      SELECT
        id,
        username,
        email,
        phone_number,
        name,
        profile_title,
        avatar_url,
        password_hash,
        auth_provider,
        provider_id,
        role,
        created_at,
        updated_at
      FROM users
      WHERE phone_number = $1 AND deleted_at IS NULL;
    `;
    try {
      return await pool.query(sql, [phoneNumber]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - findUserByPhone]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async findUserByProvider(authProvider: string, providerId: string) {
    const sql = `
      SELECT
        id,
        username,
        email,
        phone_number,
        name,
        profile_title,
        avatar_url,
        password_hash,
        auth_provider,
        provider_id,
        role,
        created_at,
        updated_at
      FROM users
      WHERE auth_provider = $1 AND provider_id = $2 AND deleted_at IS NULL;
    `;
    try {
      return await pool.query(sql, [authProvider, providerId]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - findUserByProvider]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async findUserByUsername(username: string) {
    const sql = `
      SELECT
        id,
        username,
        email,
        phone_number,
        name,
        profile_title,
        avatar_url,
        password_hash,
        auth_provider,
        provider_id,
        role,
        created_at,
        updated_at
      FROM users
      WHERE username = $1 AND deleted_at IS NULL;
    `;
    try {
      return await pool.query(sql, [username]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - findUserByUsername]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async findUserById(id: string) {
    const sql = `
      SELECT
        id,
        username,
        email,
        phone_number,
        name,
        profile_title,
        avatar_url,
        password_hash,
        auth_provider,
        provider_id,
        role,
        created_at,
        updated_at
      FROM users
      WHERE id = $1 AND deleted_at IS NULL;
    `;
    try {
      return await pool.query(sql, [id]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - findUserById]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async findUserByEmail(email: string) {
    const sql = `
      SELECT
        id,
        email,
        username,
        phone_number,
        name,
        profile_title,
        avatar_url,
        password_hash,
        auth_provider,
        provider_id,
        role,
        created_at,
        updated_at
      FROM users
      WHERE email = $1 AND deleted_at IS NULL;
    `;
    try {
      return await pool.query(sql, [email]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - findUserByEmail]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async updateUser(
    username: string | null,
    profileTitle: string | null,
    avatarUrl: string | null,
    id: string,
    name: string | null = null,
    phoneNumber: string | null = null,
    email: string | null = null,
  ) {
    const sql = `
      UPDATE users
      SET
        username = COALESCE($1, username),
        profile_title = COALESCE($2, profile_title),
        avatar_url = COALESCE($3, avatar_url),
        name = CASE WHEN $5::text IS NULL THEN name ELSE NULLIF($5::text, '') END,
        phone_number = CASE WHEN $6::text IS NULL THEN phone_number ELSE NULLIF($6::text, '') END,
        email = CASE WHEN $7::text IS NULL THEN email ELSE NULLIF($7::text, '') END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND deleted_at IS NULL
      RETURNING id, username, email, phone_number, name, profile_title, avatar_url, role, updated_at;
    `;
    try {
      return await pool.query(sql, [
        username,
        profileTitle,
        avatarUrl,
        id,
        name,
        phoneNumber,
        email,
      ]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - updateUser]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async updatePassword(hash: string, id: string) {
    const sql = `
      UPDATE users
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL;
    `;
    try {
      return await pool.query(sql, [hash, id]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - updatePassword]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async deleteUser(id: string) {
    // CRITICAL FINANCE FIX: Soft Delete
    const sql = `
      UPDATE users
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [id]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - deleteUser]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async createRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    userAgent: string | null,
    ipAddress: string | null,
    parentTokenId: string | null = null,
  ) {
    const sql = `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address, parent_token_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, parent_token_id, is_revoked, expires_at;
    `;
    try {
      return await pool.query(sql, [
        userId,
        tokenHash,
        expiresAt,
        userAgent ? userAgent.substring(0, 1024) : null, // column is VARCHAR(1024)
        ipAddress ? ipAddress.substring(0, 45) : null, // column is VARCHAR(45)
        parentTokenId,
      ]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - createRefreshToken]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async findRefreshTokenByHash(tokenHash: string) {
    const sql = `
      SELECT id, user_id, token_hash, parent_token_id, is_revoked, revoked_reason, revoked_at, expires_at, user_agent, ip_address, created_at
      FROM refresh_tokens
      WHERE token_hash = $1;
    `;
    try {
      return await pool.query(sql, [tokenHash]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - findRefreshTokenByHash]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async revokeRefreshTokenById(id: string, reason: string) {
    const sql = `
      UPDATE refresh_tokens
      SET is_revoked = true, revoked_reason = $2, revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_revoked = false
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [id, reason]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - revokeRefreshTokenById]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async revokeRefreshTokenByHash(tokenHash: string, reason: string) {
    const sql = `
      UPDATE refresh_tokens
      SET is_revoked = true, revoked_reason = $2, revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND is_revoked = false
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [tokenHash, reason]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - revokeRefreshTokenByHash]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async revokeEntireTokenFamily(userId: string, reason: string) {
    const sql = `
      UPDATE refresh_tokens
      SET is_revoked = true, revoked_reason = $2, revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_revoked = false
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [userId, reason]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - revokeEntireTokenFamily]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async revokeAllUserRefreshTokens(userId: string, reason: string) {
    const sql = `
      UPDATE refresh_tokens
      SET is_revoked = true, revoked_reason = $2, revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_revoked = false
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [userId, reason]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - revokeAllUserRefreshTokens]:${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async deleteExpiredRefreshTokens() {
    const sql = `
      DELETE FROM refresh_tokens
      WHERE expires_at < CURRENT_TIMESTAMP
      RETURNING id;
    `;
    try {
      return await pool.query(sql);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - deleteExpiredRefreshTokens]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async createSocialUser(
    email: string,
    username: string,
    name: string | null,
    avatarUrl: string | null,
    authProvider: string,
    providerId: string,
  ) {
    const sql = `
      INSERT INTO users (
        email,
        username,
        name,
        avatar_url,
        auth_provider,
        provider_id,
        password_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULL)
      RETURNING
        id,
        email,
        username,
        phone_number,
        name,
        profile_title,
        avatar_url,
        password_hash,
        auth_provider,
        provider_id,
        role,
        created_at;
    `;
    try {
      return await pool.query(sql, [
        email,
        username,
        name,
        avatarUrl,
        authProvider,
        providerId,
      ]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - createSocialUser]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async revokeOtherRefreshTokens(
    userId: string,
    currentTokenHash: string,
    reason: string,
  ) {
    const sql = `
      UPDATE refresh_tokens
      SET is_revoked = true, revoked_reason = $3, revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND token_hash != $2 AND is_revoked = false
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [userId, currentTokenHash, reason]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - revokeOtherRefreshTokens]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async getActiveSessionsByUserId(userId: string) {
    const sql = `
      SELECT id, user_agent, ip_address, created_at, expires_at
      FROM refresh_tokens
      WHERE user_id = $1 AND is_revoked = false AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC;
    `;
    try {
      return await pool.query(sql, [userId]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - getActiveSessionsByUserId]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    const sql = `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, token_hash, expires_at, created_at;
    `;
    try {
      return await pool.query(sql, [userId, tokenHash, expiresAt]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - createPasswordResetToken]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async findPasswordResetTokenByHash(tokenHash: string) {
    const sql = `
      SELECT id, user_id, token_hash, expires_at, created_at
      FROM password_reset_tokens
      WHERE token_hash = $1;
    `;
    try {
      return await pool.query(sql, [tokenHash]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - findPasswordResetTokenByHash]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async deletePasswordResetTokensForUser(userId: string) {
    const sql = `
      DELETE FROM password_reset_tokens
      WHERE user_id = $1
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [userId]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - deletePasswordResetTokensForUser]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async deletePasswordResetTokenById(tokenId: string) {
    const sql = `
      DELETE FROM password_reset_tokens
      WHERE id = $1
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [tokenId]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - deletePasswordResetTokenById]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async deleteExpiredPasswordResetTokens() {
    const sql = `
      DELETE FROM password_reset_tokens
      WHERE expires_at < CURRENT_TIMESTAMP
      RETURNING id;
    `;
    try {
      return await pool.query(sql);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - deleteExpiredPasswordResetTokens]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async updateLastActiveTimestamp(userId: string) {
    const sql = `
      UPDATE users
      SET last_active_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL;
    `;
    try {
      return await pool.query(sql, [userId]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - updateLastActiveTimestamp]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  // Atomic rotation in ONE SQL statement (one round trip):
  //   1. the CTE "revoked" marks the old token as rotated, but only if it is still active
  //   2. the INSERT creates the new token from whatever the CTE returned
  // If another request already rotated this token, the CTE returns 0 rows, so NOTHING is
  // inserted and rows.length is 0 -> rotated:false.
  // The ::casts are required because Postgres cannot guess parameter types inside a SELECT list.
  async rotateRefreshToken(
    oldSessionId: string,
    userId: string,
    newTokenHash: string,
    newExpiresAt: Date,
    userAgent: string | null,
    ipAddress: string | null,
  ) {
    const sql = `
      WITH revoked AS (
        UPDATE refresh_tokens
        SET is_revoked = true, revoked_reason = 'rotated', revoked_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND is_revoked = false
        RETURNING id
      )
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address, parent_token_id)
      SELECT $2::uuid, $3::text, $4::timestamptz, $5::text, $6::text, revoked.id
      FROM revoked
      RETURNING id, user_id, parent_token_id, is_revoked, expires_at;
    `;
    try {
      const result = await pool.query(sql, [
        oldSessionId,
        userId,
        newTokenHash,
        newExpiresAt,
        userAgent ? userAgent.substring(0, 1024) : null,
        ipAddress ? ipAddress.substring(0, 45) : null,
      ]);

      if (result.rows.length === 0) {
        return { rotated: false, session: null as any };
      }
      return { rotated: true, session: result.rows[0] as any };
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - rotateRefreshToken]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  // Ownership is enforced in SQL (user_id = $2), so nobody can revoke someone else's session
  async revokeSessionForUser(
    sessionId: string,
    userId: string,
    reason: string,
  ) {
    const sql = `
      UPDATE refresh_tokens
      SET is_revoked = true, revoked_reason = $3, revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND is_revoked = false
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [sessionId, userId, reason]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - revokeSessionForUser]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },

  async createAdminAuditLog(
    adminId: string,
    adminUsername: string,
    action: string,
    details: string,
  ) {
    const sql = `
      INSERT INTO audit_logs (admin_id, admin_username, action, details)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `;
    try {
      return await pool.query(sql, [adminId, adminUsername, action, details]);
    } catch (error) {
      process.stderr.write(
        `[AUTH_SERVICE FATAL ERROR - createAdminAuditLog]: ${(error as Error).message}\nStack: ${(error as Error).stack}\n`,
      );
      throw error;
    }
  },
};

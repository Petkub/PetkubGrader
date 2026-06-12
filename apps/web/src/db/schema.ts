/**
 * Auth.js Drizzle adapter tables.
 *
 * IMPORTANT: these only hold OAuth account links + email verification tokens
 * for Auth.js. The "real" user record lives in FastAPI's `users` table
 * (see app/models.py). On sign-in we mirror to FastAPI via /users/upsert.
 */
import { pgTable, text, timestamp, primaryKey, integer } from "drizzle-orm/pg-core";

export const users = pgTable("auth_users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "auth_accounts",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (a) => ({
    pk: primaryKey({ columns: [a.provider, a.providerAccountId] }),
  })
);

export const verificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (v) => ({
    pk: primaryKey({ columns: [v.identifier, v.token] }),
  })
);

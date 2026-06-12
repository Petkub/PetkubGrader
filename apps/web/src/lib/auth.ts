import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db/client";
import { users, accounts, verificationTokens } from "@/db/schema";
import { apiUpsertUser } from "@/lib/api";

export const DEV_LOGIN_ENABLED = process.env.ENABLE_DEV_LOGIN === "true";

const providers: Provider[] = [
  Google({ clientId: process.env.AUTH_GOOGLE_ID!, clientSecret: process.env.AUTH_GOOGLE_SECRET! }),
  GitHub({ clientId: process.env.AUTH_GITHUB_ID!, clientSecret: process.env.AUTH_GITHUB_SECRET! }),
  Resend({ apiKey: process.env.AUTH_RESEND_KEY!, from: process.env.EMAIL_FROM! }),
];

if (DEV_LOGIN_ENABLED) {
  // DEV ONLY — instant login by email, no password. Gated by ENABLE_DEV_LOGIN.
  // Never set ENABLE_DEV_LOGIN=true in production.
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").trim();
        if (!email) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Map adapter to our prefixed auth_* tables — without this it queries
  // default names ("user", "account") which don't exist in this DB.
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers,
  callbacks: {
    async signIn({ user }) {
      return Boolean(user.email);
    },
    // Mirror to FastAPI here, NOT in signIn: for OAuth-with-adapter flows the
    // `user` object jwt() receives is the adapter user, so anything stashed on
    // `user` inside signIn() is lost. The token is the only reliable carrier.
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        token.picture = user.image ?? token.picture;
      }
      if (!token.backendId && token.email) {
        try {
          const mirrored = await apiUpsertUser({
            email: token.email,
            name: token.name ?? token.email.split("@")[0],
            image_url: token.picture ?? null,
          });
          token.backendId = mirrored.id;
        } catch {
          // FastAPI unreachable — leave backendId unset; retried on next request.
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.backendId) session.user.backendId = token.backendId as string;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      backendId?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

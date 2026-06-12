import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db/client";
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
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers,
  callbacks: {
    async signIn({ user }) {
      // Mirror user to FastAPI. Creates as `pending` if new.
      if (!user.email) return false;
      const mirrored = await apiUpsertUser({
        email: user.email,
        name: user.name ?? user.email.split("@")[0],
        image_url: user.image ?? null,
      });
      // Stash backend id on the JWT via the user object — next-auth picks it up.
      (user as { backendId?: string }).backendId = mirrored.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.backendId = (user as { backendId?: string }).backendId;
        token.email = user.email ?? token.email;
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

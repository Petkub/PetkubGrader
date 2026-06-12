import { signIn, DEV_LOGIN_ENABLED } from "@/lib/auth";

export const dynamic = "force-dynamic"; // read ENABLE_DEV_LOGIN at runtime, not build

export default function SignInPage() {
  async function doSignIn(formData: FormData) {
    "use server";
    const provider = String(formData.get("provider") ?? "");
    const email = String(formData.get("email") ?? "");
    if (provider === "resend") {
      await signIn("resend", { email, redirectTo: "/problems" });
    } else if (provider === "dev") {
      await signIn("dev", { email, redirectTo: "/problems" });
    } else {
      await signIn(provider, { redirectTo: "/problems" });
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>

        <form action={doSignIn} className="space-y-2">
          <input type="hidden" name="provider" value="google" />
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Continue with Google
          </button>
        </form>

        <form action={doSignIn} className="space-y-2">
          <input type="hidden" name="provider" value="github" />
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Continue with GitHub
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-zinc-50 dark:bg-zinc-950 px-2 text-zinc-500">or email</span>
          </div>
        </div>

        <form action={doSignIn} className="space-y-2">
          <input type="hidden" name="provider" value="resend" />
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 bg-transparent"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-zinc-900 text-zinc-50 py-2 hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Send magic link
          </button>
        </form>

        {DEV_LOGIN_ENABLED && (
          <form action={doSignIn} className="space-y-2 border-t border-amber-300 dark:border-amber-800 pt-4">
            <input type="hidden" name="provider" value="dev" />
            <p className="text-xs font-medium text-amber-600">Dev login (local only)</p>
            <input
              type="email"
              name="email"
              required
              placeholder="dev@example.com"
              className="w-full rounded-md border border-amber-300 dark:border-amber-800 px-3 py-2 bg-transparent"
            />
            <button className="w-full rounded-md bg-amber-500 text-white py-2 hover:bg-amber-600">
              Dev sign in
            </button>
          </form>
        )}

        <p className="text-xs text-zinc-500">
          New accounts wait for admin approval before submitting.
        </p>
      </div>
    </main>
  );
}

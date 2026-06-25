import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  PasswordInput,
  NeonButton,
  FieldLabel,
  StrengthMeter,
  Requirements,
} from "@/components/auth/AuthPrimitives";
import { updatePassword } from "@/lib/auth-client";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({
    meta: [
      { title: "Create New Password · CA Aspire BD" },
      { name: "description", content: "Set a new password and secure your CA Aspire BD account." },
      { property: "og:title", content: "Create New Password · CA Aspire BD" },
      {
        property: "og:description",
        content: "Strong password requirements with real-time strength feedback.",
      },
    ],
  }),
});

function ResetPassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const navigate = useNavigate();
  const match = pw.length > 0 && pw === pw2;

  // Supabase v2 recovery can arrive in three shapes depending on flow type:
  //   1) PKCE (default):     /reset-password?code=<pkce>
  //   2) Implicit / hash:    /reset-password#access_token=...&type=recovery
  //   3) OTP token_hash:     /reset-password?token_hash=...&type=recovery
  // Plus error redirects: ?error=access_denied&error_code=otp_expired
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const url = new URL(window.location.href);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const typeParam = url.searchParams.get("type") || hash.get("type");
    const errorCode =
      url.searchParams.get("error_code") ||
      url.searchParams.get("error") ||
      hash.get("error_code") ||
      hash.get("error");
    const errorDescription =
      url.searchParams.get("error_description") || hash.get("error_description");

    // Track recovery event so we accept the session that gets set by
    // detectSessionInUrl (implicit hash flow) without false negatives.
    let sawRecovery = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        sawRecovery = true;
        if (!cancelled) setReady(true);
      }
    });

    (async () => {
      try {
        if (errorCode) {
          setLinkError(
            errorDescription ||
              (errorCode === "otp_expired"
                ? "This password reset link has expired. Request a new one."
                : "This password reset link is invalid. Request a new one."),
          );
          return;
        }

        // PKCE flow → exchange the code for a session.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setLinkError(error.message || "Reset link could not be verified.");
            return;
          }
          if (!cancelled) {
            setReady(true);
            // strip ?code= from the URL
            window.history.replaceState({}, "", "/reset-password");
          }
          return;
        }

        // OTP token_hash flow.
        if (tokenHash && typeParam) {
          const { error } = await supabase.auth.verifyOtp({
            type: typeParam as "recovery",
            token_hash: tokenHash,
          });
          if (error) {
            setLinkError(error.message || "Reset link could not be verified.");
            return;
          }
          if (!cancelled) {
            setReady(true);
            window.history.replaceState({}, "", "/reset-password");
          }
          return;
        }

        // Implicit hash flow (#access_token=...&type=recovery) — the
        // Supabase client's detectSessionInUrl already consumed the hash
        // and emits PASSWORD_RECOVERY. Give it a moment, then fall back
        // to checking the current session.
        if (typeParam === "recovery" || window.location.hash.includes("access_token")) {
          // wait briefly for onAuthStateChange
          await new Promise((r) => setTimeout(r, 400));
          if (sawRecovery) return;
        }

        // Last resort — if a session exists at all (e.g. user already
        // signed in via recovery on this tab), allow the form.
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          if (data.session) setReady(true);
          else
            setLinkError(
              "This page can only be opened from a password reset email link.",
            );
        }
      } catch (e) {
        if (!cancelled)
          setLinkError(
            (e as Error).message || "Could not verify your reset link. Please try again.",
          );
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return toast.error("Reset link not verified yet.");
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (!match) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      await updatePassword(pw);
      // sign out so the user must log in with the new password
      await supabase.auth.signOut();
      toast.success("Password updated. Please sign in.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error((err as Error).message ?? "Could not update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-[0_0_30px_var(--neon-purple)]">
        <KeyRound className="h-6 w-6" />
      </div>
      <h2 className="text-center font-display text-3xl font-bold tracking-tight">
        Create new password
      </h2>
      <p className="mt-1.5 text-center text-sm text-muted-foreground">
        Choose a strong password to re-secure your account.
      </p>

      {linkError && (
        <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-center text-xs text-rose-300">
          {linkError}
          <div className="mt-2">
            <Link
              to="/forgot-password"
              className="font-semibold text-[var(--neon-blue)] hover:underline"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      )}
      {!ready && !linkError && (
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Verifying your reset link…
        </p>
      )}

      <form className="mt-7 space-y-4" onSubmit={onSubmit}>
        <div>
          <FieldLabel htmlFor="reset-password-new">New password</FieldLabel>
          <PasswordInput
            id="reset-password-new"
            name="new-password"
            autoComplete="new-password"
            value={pw}
            onChange={setPw}
          />
          <StrengthMeter value={pw} />
        </div>
        <div>
          <FieldLabel htmlFor="reset-password-confirm">Confirm password</FieldLabel>
          <PasswordInput
            id="reset-password-confirm"
            name="confirm-password"
            autoComplete="new-password"
            value={pw2}
            onChange={setPw2}
          />
          {pw2.length > 0 && (
            <p
              id="reset-password-match"
              aria-live="polite"
              className={`mt-1 text-[11px] ${match ? "text-emerald-400" : "text-rose-400"}`}
            >
              {match ? "Passwords match." : "Passwords do not match."}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3 w-3 text-[var(--neon-purple)]" /> Security checklist
          </div>
          <Requirements value={pw} />
        </div>

        <NeonButton type="submit" disabled={loading || !ready}>
          {loading ? "Updating…" : "Reset password"}
        </NeonButton>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="font-semibold text-[var(--neon-blue)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}

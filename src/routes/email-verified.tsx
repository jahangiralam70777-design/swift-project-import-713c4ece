import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, ArrowRight, MailCheck, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { NeoInput, NeonButton, FieldLabel } from "@/components/auth/AuthPrimitives";
import { supabase } from "@/integrations/supabase/client";
import { resendVerificationEmail } from "@/lib/auth-client";

export const Route = createFileRoute("/email-verified")({
  component: EmailVerified,
  head: () => ({
    meta: [
      { title: "Email Verified · CA Aspire BD" },
      { name: "description", content: "Your email is verified. Welcome aboard CA Aspire BD." },
      { property: "og:title", content: "Email Verified · CA Aspire BD" },
      {
        property: "og:description",
        content: "You're all set — continue to your personalized dashboard.",
      },
    ],
  }),
});

function Confetti() {
  const pieces = Array.from({ length: 24 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = (i * 41) % 100;
        const delay = (i % 7) * 0.4;
        const colors = [
          "var(--neon-purple)",
          "var(--neon-blue)",
          "var(--neon-pink)",
          "#34d399",
          "#fbbf24",
        ];
        return (
          <span
            key={i}
            className="absolute h-2 w-2 rounded-sm animate-float"
            style={{
              left: `${left}%`,
              top: `${(i * 23) % 80}%`,
              background: colors[i % colors.length],
              boxShadow: `0 0 10px ${colors[i % colors.length]}`,
              animationDelay: `${delay}s`,
              transform: `rotate(${(i * 37) % 360}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

type Status = "verifying" | "success" | "expired" | "error";

function EmailVerified() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState<string>("");
  const [verifiedEmail, setVerifiedEmail] = useState<string>("");
  const [resendEmail, setResendEmail] = useState<string>("");
  const [resending, setResending] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ranRef.current) return; // StrictMode double-invoke guard
    ranRef.current = true;

    let cancelled = false;

    const url = new URL(window.location.href);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const typeParam =
      url.searchParams.get("type") || hash.get("type") || "signup";
    const errorCode =
      url.searchParams.get("error_code") ||
      url.searchParams.get("error") ||
      hash.get("error_code") ||
      hash.get("error");
    const errorDescription =
      url.searchParams.get("error_description") || hash.get("error_description");

    // Recovery links must never be silently consumed here.
    if (typeParam === "recovery") {
      navigate({ to: "/reset-password", replace: true });
      return;
    }

    const finishSuccess = async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) setVerifiedEmail(data.user.email);
      } catch {
        /* noop */
      }
      setStatus("success");
      // Strip auth params from the URL.
      window.history.replaceState({}, "", "/email-verified");
    };

    const failExpired = (msg?: string) => {
      if (cancelled) return;
      setStatus("expired");
      setMessage(
        msg ||
          "This verification link has expired or was already used. Request a new one below.",
      );
    };

    const failError = (msg: string) => {
      if (cancelled) return;
      setStatus("error");
      setMessage(msg);
    };

    (async () => {
      try {
        if (errorCode) {
          if (/expired|otp_expired/i.test(errorCode)) {
            failExpired(errorDescription || undefined);
          } else {
            failError(errorDescription || "This verification link is invalid.");
          }
          return;
        }

        // 1) PKCE flow: ?code=<pkce>
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (/expired|invalid/i.test(error.message)) failExpired(error.message);
            else failError(error.message);
            return;
          }
          await finishSuccess();
          return;
        }

        // 2) OTP flow: ?token_hash=...&type=signup|email|email_change|invite|magiclink
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: typeParam as
              | "signup"
              | "email"
              | "email_change"
              | "invite"
              | "magiclink",
            token_hash: tokenHash,
          });
          if (error) {
            if (/expired|invalid/i.test(error.message)) failExpired(error.message);
            else failError(error.message);
            return;
          }
          await finishSuccess();
          return;
        }

        // 3) Legacy implicit/hash flow: #access_token=...&type=signup
        //    Supabase client (detectSessionInUrl) consumes this automatically.
        if (window.location.hash.includes("access_token")) {
          await new Promise((r) => setTimeout(r, 500));
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            await finishSuccess();
            return;
          }
          failError("Could not establish a session from the verification link.");
          return;
        }

        // 4) Direct visit (no params). If a session already exists treat as success.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await finishSuccess();
          return;
        }

        failError(
          "No verification token found in the URL. Open this page from the link in your confirmation email.",
        );
      } catch (e) {
        failError((e as Error).message || "Verification failed unexpectedly.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return toast.error("Enter your email to resend the link.");
    setResending(true);
    try {
      await resendVerificationEmail(resendEmail.trim());
      toast.success("New verification email sent. Check your inbox.");
    } catch (err) {
      toast.error((err as Error).message || "Could not resend verification email.");
    } finally {
      setResending(false);
    }
  };

  if (status === "verifying") {
    return (
      <AuthShell>
        <div className="py-10 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[var(--neon-blue)]" />
          <h2 className="mt-5 font-display text-2xl font-bold">Verifying your email…</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hold tight while we confirm your account.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (status === "success") {
    return (
      <AuthShell>
        <div className="relative py-4 text-center">
          <Confetti />
          <div className="relative mx-auto grid h-24 w-24 place-items-center">
            <div
              className="absolute inset-0 rounded-full opacity-70 blur-2xl animate-pulse-glow"
              style={{ background: "var(--neon-purple)" }}
            />
            <div className="absolute inset-2 rounded-full border-2 border-[var(--neon-blue)]/40" />
            <div className="absolute inset-5 rounded-full border-2 border-[var(--neon-purple)]/60" />
            <div className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 via-[var(--neon-blue)] to-[var(--neon-purple)] text-white shadow-[0_0_40px_var(--neon-purple)] animate-scale-in">
              <Check className="h-8 w-8" strokeWidth={3} />
            </div>
          </div>

          <h2 className="mt-6 font-display text-3xl font-bold tracking-tight">Email verified!</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Your account is now active. Step into your AI-personalized learning command deck.
          </p>

          {verifiedEmail && (
            <div className="mx-auto mt-5 flex items-center justify-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400">
              <MailCheck className="h-3.5 w-3.5" /> {verifiedEmail} · confirmed
            </div>
          )}

          <div className="mt-7 space-y-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/dashboard" })}
              className="block w-full"
            >
              <NeonButton>
                Continue to dashboard <ArrowRight className="h-4 w-4" />
              </NeonButton>
            </button>
            <Link
              to="/login"
              className="block text-xs font-semibold text-muted-foreground hover:text-[var(--neon-blue)]"
            >
              or return to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  // expired / error
  return (
    <AuthShell>
      <div className="py-4 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-rose-500/30 to-amber-500/30 text-rose-300">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold">
          {status === "expired" ? "Link expired" : "Verification failed"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>

        <form className="mx-auto mt-6 max-w-sm space-y-3 text-left" onSubmit={onResend}>
          <div>
            <FieldLabel htmlFor="resend-email">Resend verification email</FieldLabel>
            <NeoInput
              id="resend-email"
              type="email"
              autoComplete="email"
              placeholder="you@school.edu"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              icon={<MailCheck className="h-4 w-4" />}
            />
          </div>
          <NeonButton type="submit" disabled={resending}>
            <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />{" "}
            {resending ? "Sending…" : "Send a new link"}
          </NeonButton>
        </form>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/login" className="font-semibold hover:text-[var(--neon-blue)]">
            Back to sign in
          </Link>
          <Link to="/signup" className="font-semibold hover:text-[var(--neon-blue)]">
            Create account
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

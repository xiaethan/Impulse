import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";

type Mode = "login" | "signup";
type Step = "form" | "verify";
type Delivery = "email" | "log";

type AuthValue = {
  email: string;
  logout: () => Promise<void>;
};

type AuthResponse = {
  email?: string;
  error?: string;
  status?: "verify";
  delivery?: Delivery;
};

const AuthContext = createContext<AuthValue | null>(null);

const specialCharacter = /[^A-Za-z0-9]/;
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthGate");
  }
  return value;
}

export function initialsFromEmail(email: string) {
  const letters = (email.split("@")[0] ?? "").replace(/[^a-z]/gi, "");
  return (letters.slice(0, 2) || "EC").toUpperCase();
}

function emailRules(email: string) {
  return {
    length: email.length > 8,
    special: specialCharacter.test(email),
    format: emailShape.test(email),
  };
}

function passwordRules(password: string) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

function passwordStrength(password: string): "Weak" | "Fair" | "Strong" {
  const rules = passwordRules(password);
  let score = 0;
  if (rules.length) score += 1;
  if (rules.upper) score += 1;
  if (rules.number) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (password.length >= 12) score += 1;
  if (specialCharacter.test(password)) score += 1;
  if (score >= 5) return "Strong";
  if (rules.length && rules.upper && rules.number) return "Fair";
  return "Weak";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "anon" | "in">("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as { email: string };
      })
      .then((body) => {
        if (!active) {
          return;
        }
        if (body?.email) {
          setEmail(body.email);
          setStatus("in");
        } else {
          setStatus("anon");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("anon");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setEmail("");
    setStatus("anon");
  }

  if (status === "loading") {
    return (
      <div className="auth-screen">
        <img className="auth-logo" src="/impulse-logo.png?v=2" alt="Impulse" />
      </div>
    );
  }

  if (status === "anon") {
    return (
      <LoginPage
        onSuccess={(nextEmail) => {
          setEmail(nextEmail);
          setStatus("in");
        }}
      />
    );
  }

  return <AuthContext.Provider value={{ email, logout }}>{children}</AuthContext.Provider>;
}

function LoginPage({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [step, setStep] = useState<Step>("form");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>("email");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const emailCheck = emailRules(email);
  const passwordCheck = passwordRules(password);
  const strength = passwordStrength(password);
  const signupReady = emailCheck.length && emailCheck.special && emailCheck.format && passwordCheck.length && passwordCheck.upper && passwordCheck.number;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (!authError) {
      return;
    }
    setError(authError);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "signup" && !signupReady) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as AuthResponse;
      if (!response.ok) {
        setError(body.error ?? "Could not sign in.");
        return;
      }
      if (body.status === "verify" && body.email) {
        setDelivery(body.delivery ?? "email");
        setStep("verify");
        return;
      }
      if (!body.email) {
        setError(body.error ?? "Could not sign in.");
        return;
      }
      onSuccess(body.email);
    } catch {
      setError("The server is unavailable. Check that the API and PostgreSQL are running.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = (await response.json()) as AuthResponse;
      if (!response.ok || !body.email) {
        setError(body.error ?? "That code is incorrect.");
        return;
      }
      onSuccess(body.email);
    } catch {
      setError("The server is unavailable. Check that the API and PostgreSQL are running.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setError("");
    setResending(true);
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as AuthResponse;
      if (!response.ok) {
        setError(body.error ?? "Could not send a new code.");
        return;
      }
      if (body.delivery) {
        setDelivery(body.delivery);
      }
    } catch {
      setError("The server is unavailable. Check that the API and PostgreSQL are running.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-stack">
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {step === "verify" ? (
          <form className="auth-card" onSubmit={onVerify}>
            <img className="auth-logo" src="/impulse-logo.png?v=2" alt="Impulse" />
            <h1>Confirm your account</h1>
            <p className="auth-lead">Enter the 6-digit code sent to {email}.</p>
            {delivery === "log" && (
              <p className="auth-note">Mail is not configured on this machine yet, so the code was printed in the API terminal.</p>
            )}
            <label className="auth-field">
              <span>Confirmation code</span>
              <input
                className="code-input"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </label>
            <button className={submitting ? "auth-submit busy" : "auth-submit"} type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? <Spinner label="Confirming code" /> : "Confirm account"}
            </button>
            <div className="auth-links">
              <button type="button" className="ghost" onClick={() => void resend()} disabled={resending}>
                {resending ? "Sending" : "Resend code"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setStep("form");
                  setError("");
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        ) : (
          <form className="auth-card" onSubmit={onSubmit}>
            <img className="auth-logo" src="/impulse-logo.png?v=2" alt="Impulse" />
            <h1>{mode === "login" ? "Log in" : "Create an account"}</h1>
            <p className="auth-lead">
              {mode === "login"
                ? "Use your email and password to open the dashboard."
                : "Sign up with an email and a password. We'll email you a confirmation code."}
            </p>
            <div className="auth-switch" role="tablist" aria-label="Account">
              <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => switchMode("login")}>
                Log in
              </button>
              <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => switchMode("signup")}>
                Sign up
              </button>
            </div>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            {mode === "signup" && (
              <ul className="rules" aria-label="Email requirements">
                <Rule met={emailCheck.length}>More than 8 characters</Rule>
                <Rule met={emailCheck.special}>At least 1 special character</Rule>
                <Rule met={emailCheck.format}>A valid email address</Rule>
              </ul>
            )}
            <label className="auth-field">
              <span>Password</span>
              <span className="password-row">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <img
                    src={showPassword ? "/password-hide.png" : "/password-show.png"}
                    alt=""
                  />
                </button>
              </span>
            </label>
            {mode === "signup" && (
              <>
                <ul className="rules" aria-label="Password requirements">
                  <Rule met={passwordCheck.length}>At least 8 characters</Rule>
                  <Rule met={passwordCheck.upper}>One uppercase letter</Rule>
                  <Rule met={passwordCheck.number}>One number</Rule>
                </ul>
                <p className={`strength ${strength.toLowerCase()}`} aria-live="polite">
                  <span>{strength}</span>
                  <span className="strength-track" aria-hidden="true">
                    <span className="strength-fill" />
                  </span>
                </p>
              </>
            )}
            <button
              className={submitting ? "auth-submit busy" : "auth-submit"}
              type="submit"
              disabled={submitting || (mode === "signup" && !signupReady)}
              aria-busy={submitting}
            >
              {submitting ? <Spinner label={mode === "login" ? "Logging in" : "Creating account"} /> : mode === "login" ? "Log in" : "Sign up"}
            </button>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <a className="oauth google" href="/api/auth/google">
              <GoogleMark />
              Continue with Google
            </a>
          </form>
        )}
      </div>
    </div>
  );
}

function Rule({ met, children }: { met: boolean; children: string }) {
  return (
    <li className={met ? "rule met" : "rule"}>
      <span aria-hidden="true">{met ? "✓" : "○"}</span>
      {children}
    </li>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <>
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="oauth-icon">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.7A5.4 5.4 0 0 1 3.6 9c0-.6.1-1.2.3-1.7V5H.9A9 9 0 0 0 0 9c0 1.4.3 2.8.9 4l3-2.3Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15.1 2A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6Z" />
    </svg>
  );
}


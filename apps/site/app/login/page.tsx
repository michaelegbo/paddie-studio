"use client";

import { Button, Logo } from "@paddie-studio/ui";

export default function LoginPage() {
  const startLogin = () => {
    window.location.href = "/api/auth/login?returnTo=/app";
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel fade-up">
        <div className="auth-brand">
          <Logo width={88} height={25} />
          <span className="brand-labels">
            <span className="brand-sub">Paddie Product</span>
            <span className="brand-main">Studio Login</span>
          </span>
        </div>

        <h1 className="auth-title">Sign in to Paddie Studio</h1>
        <p className="auth-copy">
          Authentication uses Authorization Code + PKCE through Paddie OIDC. After sign-in,
          you are redirected into the standalone Studio app at <code>/app</code>.
        </p>

        <div className="auth-actions">
          <Button onClick={startLogin} className="button-lift">
            Continue with Paddie
          </Button>
          <Button variant="ghost" onClick={() => (window.location.href = "/signup")}>
            Create account
          </Button>
        </div>
      </section>
    </main>
  );
}


"use client";

import { Button, Logo } from "@paddie-studio/ui";

export default function SignupPage() {
  return (
    <main className="auth-shell">
      <section className="auth-panel fade-up">
        <div className="auth-brand">
          <Logo width={88} height={25} />
          <span className="brand-labels">
            <span className="brand-sub">Paddie Product</span>
            <span className="brand-main">Studio Signup</span>
          </span>
        </div>

        <h1 className="auth-title">Create your Studio account</h1>
        <p className="auth-copy">
          Studio is a first-party Paddie product. Continue to secure sign-in to create an account
          and return directly into the Studio builder.
        </p>

        <div className="auth-actions">
          <Button
            className="button-lift"
            onClick={() => (window.location.href = "/api/auth/login?returnTo=/app&screenHint=signup")}
          >
            Continue to sign up
          </Button>
          <Button variant="ghost" onClick={() => (window.location.href = "/login")}>
            Already have an account
          </Button>
        </div>
      </section>
    </main>
  );
}


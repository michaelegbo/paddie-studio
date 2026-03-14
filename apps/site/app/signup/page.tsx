"use client";

import { Button, Logo } from "@paddie-studio/ui";

export default function SignupPage() {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <Logo />
          <strong>Create Studio Account</strong>
        </div>
        <p>This page will redirect through the Paddie OIDC registration flow in the next integration pass.</p>
        <div style={{ marginTop: 18 }}>
          <Button onClick={() => (window.location.href = "/login")}>Continue</Button>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { Button, Logo } from "@paddie-studio/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <Logo />
          <strong>Studio Login</strong>
        </div>
        <p>Studio-branded login surface. Final auth is backed by the Paddie OIDC provider and Studio sessions.</p>
        <label htmlFor="email">Email</label>
        <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="********" />
        <div style={{ marginTop: 18, display: "flex", gap: 12 }}>
          <Button onClick={() => (window.location.href = "/app")}>Login</Button>
          <Button variant="ghost" onClick={() => (window.location.href = "/signup")}>Create Account</Button>
        </div>
      </div>
    </main>
  );
}

'use client';

import { Button, Logo } from '@paddie-studio/ui';

export default function SignupPage() {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Logo />
          <strong>Create Studio Account</strong>
        </div>
        <p>
          Studio uses first-party Paddie identity. Continue to the secure sign-in flow and create your account there.
        </p>
        <div style={{ marginTop: 18 }}>
          <Button onClick={() => (window.location.href = '/api/auth/login?returnTo=/app')}>Continue</Button>
        </div>
      </div>
    </main>
  );
}

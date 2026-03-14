'use client';

import { Button, Logo } from '@paddie-studio/ui';

export default function LoginPage() {
  const startLogin = () => {
    window.location.href = '/api/auth/login?returnTo=/app';
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Logo />
          <strong>Studio Login</strong>
        </div>
        <p>
          Sign in with your Paddie account using secure OIDC authorization code flow with PKCE.
        </p>
        <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
          <Button onClick={startLogin}>Sign In</Button>
          <Button variant="ghost" onClick={() => (window.location.href = '/signup')}>
            Create Account
          </Button>
        </div>
      </div>
    </main>
  );
}

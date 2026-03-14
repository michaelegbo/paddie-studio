'use client';

import { useEffect } from 'react';

export default function AuthCallbackPage() {
  useEffect(() => {
    const search = window.location.search;
    window.location.replace(`/api/auth/callback${search}`);
  }, []);

  return (
    <main className="auth-shell">
      <section className="auth-panel fade-up">
        <h1 className="auth-title" style={{ marginTop: 0 }}>Completing login...</h1>
        <p className="auth-copy">Finalizing secure OIDC callback and redirecting to Studio.</p>
      </section>
    </main>
  );
}


'use client';

import { useEffect } from 'react';

export default function AuthCallbackPage() {
  useEffect(() => {
    const search = window.location.search;
    window.location.replace(`/api/auth/callback${search}`);
  }, []);

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <strong>Completing login...</strong>
      </div>
    </main>
  );
}

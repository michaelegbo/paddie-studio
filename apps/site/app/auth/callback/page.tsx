"use client";

import { useEffect } from "react";

export default function AuthCallbackPage() {
  useEffect(() => {
    window.location.replace("/app");
  }, []);

  return <main className="auth-wrap"><div className="auth-card"><strong>Completing login...</strong></div></main>;
}

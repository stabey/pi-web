"use client";

import { useEffect } from "react";
import { installSecureFetch } from "@/lib/crypto/client";

// Install as soon as this client module is evaluated (before component effects
// run), so early data-fetching effects are already intercepted. Idempotent.
installSecureFetch();

// Installs the transparent fetch-encryption layer as early as possible on the
// client. Runs once; safe to render multiple times.
export function CryptoBootstrap() {
  useEffect(() => {
    installSecureFetch();
  }, []);
  return null;
}

"use client";

import { useEffect, useState } from "react";

/**
 * A hex colour from a CSS token, for supplied components that take colours as props (SloshGauge,
 * VoicePill). Read after mount, so it follows the theme the page actually has.
 */
export function useTokenHex(name: string, fallback: string): string {
  const [hex, setHex] = useState(fallback);
  useEffect(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(value)) setHex(value);
  }, [name]);
  return hex;
}

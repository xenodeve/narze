const PRIVATE_V4: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 (link-local, cloud metadata)
  [0xac100000, 12], // 172.16/12
  [0xc0a80000, 16], // 192.168/16
  [0x64400000, 10], // 100.64/10 (carrier-grade NAT)
];

function ipv4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((acc, p) => acc * 256 + Number(p), 0);
}

/**
 * Whether a URL names a host on this machine or the private network. Lavalink fetches whatever URL
 * /play passes it (the `http` source), so these are refused to keep it from reaching internal
 * services. A public hostname that resolves to a private address is not caught here; that needs
 * network isolation of the Lavalink container.
 */
export function isInternalUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !host.includes(":")) return true; // localhost, compose service names
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
  const v4 = ipv4(host);
  if (v4 !== null) {
    return PRIVATE_V4.some(([base, bits]) => v4 >>> (32 - bits) === base >>> (32 - bits));
  }
  if (host.includes(":")) {
    return (
      host === "::" || host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:")
    );
  }
  return false;
}

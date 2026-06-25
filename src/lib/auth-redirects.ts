export const CANONICAL_AUTH_ORIGIN = "https://caaspirebd.xyz";

function cleanOrigin(origin: string) {
  return origin.replace(/\/+$/, "");
}

export function getAuthRedirectUrl(path: "/email-verified" | "/reset-password") {
  return `${cleanOrigin(CANONICAL_AUTH_ORIGIN)}${path}`;
}

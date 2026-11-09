export function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password;
  } catch {
    return false;
  }
}

// Only ever render http(s) links; never put an arbitrary string into href.
export const safeHref = (value) => (isHttpUrl(value) ? value : undefined);

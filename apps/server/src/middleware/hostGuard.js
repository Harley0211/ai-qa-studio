import { ApiError } from '../lib/errors.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Defends the API against DNS-rebinding: a hostile web page cannot reach it
// through a domain name that later resolves to 127.0.0.1. Only localhost and
// the public host names configured in PUBLIC_HOSTS are accepted; an entry
// starting with "." allows every host ending with it.
export function hostGuard(publicHosts = []) {
  const exact = new Set(publicHosts.filter((h) => !h.startsWith('.')));
  const suffixes = publicHosts.filter((h) => h.startsWith('.'));

  return (req, _res, next) => {
    const hostname = String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    const allowed =
      LOCAL_HOSTS.has(hostname) ||
      exact.has(hostname) ||
      suffixes.some((suffix) => hostname.length > suffix.length && hostname.endsWith(suffix));

    if (!allowed) {
      return next(new ApiError(403, 'FORBIDDEN_HOST', 'Requests must use a localhost address'));
    }
    next();
  };
}

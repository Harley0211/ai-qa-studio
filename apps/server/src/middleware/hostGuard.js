import { ApiError } from '../lib/errors.js';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Defends the local-only API against DNS-rebinding: a hostile web page cannot
// reach it through a domain name that later resolves to 127.0.0.1.
export function hostGuard() {
  return (req, _res, next) => {
    const hostname = String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    if (!ALLOWED_HOSTS.has(hostname)) {
      return next(new ApiError(403, 'FORBIDDEN_HOST', 'Requests must use a localhost address'));
    }
    next();
  };
}


export class ApiClientError extends Error {
  constructor({ status, code, message, fields = {} }) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let res;

  const isFormData = body instanceof FormData;

  try {
    res = await fetch(`/api${path}`, {
      method,
      headers:
        body !== undefined && !isFormData
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the backend. Make sure the server is running.',
    });
  }

  if (res.status === 204) return null;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const err = payload?.error;
    throw new ApiClientError({
      status: res.status,
      code: err?.code ?? 'HTTP_ERROR',
      message: err?.message ?? `Request failed (${res.status})`,
      fields: err?.details?.fields ?? {},
    });
  }

  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  upload: (path, formData) =>
    request(path, { method: 'POST', body: formData }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

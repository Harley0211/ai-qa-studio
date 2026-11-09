import { ApiError } from '../lib/errors.js';
import multer from 'multer';

function zodFields(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong on the server';
  let details;

  if (err instanceof ApiError) {
    ({ status, code, message, details } = err);
  } else if (err?.name === 'ZodError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = { fields: zodFields(err) };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (err?.code === 'P2025') {
    status = 404;
    code = 'NOT_FOUND';
    message = 'The requested record was not found';
  } else if (err?.code === 'P2002') {
    status = 409;
    code = 'CONFLICT';
    message = 'A record with the same unique value already exists';
  } else if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      code = 'FILE_TOO_LARGE';
      message = 'Image exceeds the maximum upload size';
    } else {
      status = 400;
      code = 'UPLOAD_ERROR';
      message = 'Invalid file upload';
    }
  } else if (process.env.NODE_ENV !== 'test') {
    console.error('[unhandled error]', err);
  }

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

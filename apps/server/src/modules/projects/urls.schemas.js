import { z } from 'zod';

export const optionalText = (label, max) =>
  z
    .string({ invalid_type_error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((value) => (value === '' ? null : value));

// Stores only http(s) URLs without embedded credentials. Network-level SSRF
// protection is enforced later, at inspection time (Phase 3), not here.
export const httpUrl = z
  .string({ required_error: 'URL is required', invalid_type_error: 'URL must be text' })
  .trim()
  .min(1, 'URL is required')
  .max(2048, 'URL must be 2048 characters or fewer')
  .transform((value, ctx) => {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid URL, e.g. https://example.com' });
      return z.NEVER;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Only http and https URLs are supported' });
      return z.NEVER;
    }
    if (parsed.username || parsed.password) {
      ctx.addIssue({ code: 'custom', message: 'URLs must not contain embedded credentials' });
      return z.NEVER;
    }
    return parsed.href;
  });

const label = optionalText('Label', 100).nullable().optional();

export const createUrlSchema = z.object({ url: httpUrl, label });

export const updateUrlSchema = z
  .object({ url: httpUrl.optional(), label })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

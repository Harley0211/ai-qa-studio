import { describe, expect, it } from 'vitest';
import { isHttpUrl, safeHref } from './url.js';

describe('url helpers', () => {
  it.each(['https://example.com', 'http://localhost:3000/path?x=1'])('accepts %s', (u) => {
    expect(isHttpUrl(u)).toBe(true);
    expect(safeHref(u)).toBe(u);
  });

  it.each(['javascript:alert(1)', 'ftp://example.com', 'example.com', '', 'https://user:pw@example.com'])('rejects %s', (u) => {
    expect(isHttpUrl(u)).toBe(false);
    expect(safeHref(u)).toBeUndefined();
  });
});

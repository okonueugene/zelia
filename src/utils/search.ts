/**
 * Normalize a search query for consistent API and client-side matching:
 * trim, collapse whitespace, optional lowercase.
 */
export function normalizeSearchQuery(q: string): string {
  return q
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Simple fuzzy match: true if query chars appear in text in order (subsequence).
 * Case-insensitive. Use after normalizing for best results.
 * e.g. fuzzyMatch("jhn", "John Doe") => true, fuzzyMatch("pas", "Pasta") => true
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q.length) return true;
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) j++;
  }
  return j === q.length;
}

/**
 * Build a single searchable string for a customer (name + phone).
 */
export function customerSearchableText(c: { first_name?: string; last_name?: string; phone_number?: string }): string {
  return [c.first_name, c.last_name, c.phone_number].filter(Boolean).join(' ');
}

/**
 * Build a single searchable string for a product (name + barcode).
 */
export function productSearchableText(p: { name?: string; barcode?: string }): string {
  return [p.name, p.barcode].filter(Boolean).join(' ');
}

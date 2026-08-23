/**
 * Minimal, Workers-safe renderer for precompiled email HTML.
 *
 * Templates support only dot-path interpolation. Double braces are HTML escaped;
 * triple braces intentionally preserve trusted values such as complete URLs.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getValue(data: Record<string, unknown>, path: string): string {
  const value = path.trim().split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, data);

  return value === null || value === undefined ? '' : String(value);
}

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/{{{\s*([^{}]+?)\s*}}}|{{\s*([^{}]+?)\s*}}/g, (_, rawPath, escapedPath) => {
    const value = getValue(data, rawPath || escapedPath);
    return rawPath ? value : escapeHtml(value);
  });
}

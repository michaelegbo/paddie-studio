export interface MappingFieldCandidate {
  sourceLabel: string;
  sourcePath: string;
  preview: string;
  value: any;
}

export function toInlinePreview(value: any): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length > 96 ? `${compact.slice(0, 96)}...` : compact;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length === 0 ? '{}' : `{${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', ...' : ''}}`;
  }
  return String(value);
}

export function flattenFieldCandidates(
  value: any,
  basePath: string,
  sourceLabel: string,
  output: MappingFieldCandidate[],
  depth = 0
): void {
  if (!basePath) return;
  if (output.length >= 240) return;

  output.push({
    sourceLabel,
    sourcePath: basePath,
    preview: toInlinePreview(value),
    value,
  });

  if (depth >= 3 || value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    const maxItems = Math.min(value.length, 5);
    for (let index = 0; index < maxItems; index += 1) {
      flattenFieldCandidates(value[index], `${basePath}[${index}]`, sourceLabel, output, depth + 1);
      if (output.length >= 240) return;
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  const keys = Object.keys(value).slice(0, 16);
  for (const key of keys) {
    flattenFieldCandidates(value[key], `${basePath}.${key}`, sourceLabel, output, depth + 1);
    if (output.length >= 240) return;
  }
}

export function getTargetFieldSuggestion(sourcePath: string): string {
  const normalized = String(sourcePath || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/^\.|\.$/g, '');
  if (!normalized) return 'value';
  const parts = normalized.split('.').filter(Boolean);
  const tail = parts[parts.length - 1] || 'value';
  if (/^\d+$/.test(tail)) {
    return parts[parts.length - 2] || 'value';
  }
  return tail;
}

export function collectFieldPaths(value: any, prefix: string, output: Set<string>, depth = 0): void {
  if (!prefix) return;
  output.add(prefix);

  if (depth >= 3 || value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > 0) {
      collectFieldPaths(value[0], `${prefix}[0]`, output, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  const keys = Object.keys(value).slice(0, 12);
  for (const key of keys) {
    const next = `${prefix}.${key}`;
    output.add(next);
    collectFieldPaths(value[key], next, output, depth + 1);
  }
}

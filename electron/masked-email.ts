export function maskEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1 || /\s/.test(normalized)) {
    return null;
  }

  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  const [domainLabel, ...suffixes] = domain.split(".");
  if (!domainLabel || suffixes.some((suffix) => !suffix)) {
    return null;
  }

  return `${maskSegment(local, 2)}@${maskSegment(domainLabel, 1)}${suffixes.length > 0 ? `.${suffixes.join(".")}` : ""}`;
}

function maskSegment(value: string, visibleCharacters: number) {
  return `${value.slice(0, Math.min(visibleCharacters, value.length))}***`;
}

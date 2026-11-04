function isValidHttpUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2040) return false;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (!parsed.hostname || parsed.username || parsed.password) return false;
    if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost")) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = { isValidHttpUrl };

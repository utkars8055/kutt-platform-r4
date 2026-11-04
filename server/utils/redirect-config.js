function normalizeCountdownSeconds(value, fallback = 12, maximum = 30) {
  const parsed = Number(value);
  const selected = Number.isFinite(parsed) ? parsed : fallback;
  const parsedMax = Number(maximum);
  const max = Math.max(0, Math.min(30, Math.floor(Number.isFinite(parsedMax) ? parsedMax : 30)));
  return Math.max(0, Math.min(max, Math.floor(selected)));
}

module.exports = { normalizeCountdownSeconds };

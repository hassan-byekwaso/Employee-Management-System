const MIN_SECRET_LENGTH = 32;

function validateEnvironment(env) {
  const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET'];
  const missing = required.filter((key) => !env[key] || !env[key].trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (env.JWT_ACCESS_SECRET.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const port = env.PORT === undefined ? 5000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const secure = env.NODE_ENV === 'production' || env.COOKIE_SECURE === 'true';
  const sameSite = secure ? 'none' : 'lax';
  const origins = (env.CLIENT_ORIGIN || env.CLIENT_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .map((origin) => origin.replace(/\/+$/, ''))
    .filter(Boolean);
  if (!origins.length) {
    throw new Error('CLIENT_ORIGIN must contain at least one allowed origin');
  }
  if (origins.includes('*') || origins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin;
    } catch {
      return true;
    }
  })) {
    throw new Error('CLIENT_ORIGIN must contain exact http(s) origins; wildcards are not allowed');
  }
  return {
    mongoUri: env.MONGODB_URI,
    port,
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtl: env.JWT_ACCESS_TTL || '15m',
    refreshDays: Math.max(1, Number(env.REFRESH_TOKEN_DAYS) || 7),
    refreshCookieName: env.REFRESH_COOKIE_NAME || 'ems_refresh',
    origins,
    cookieSecure: secure,
    cookieSameSite: sameSite
  };
}

module.exports = { validateEnvironment };

// URL validation logic shared between API and tests.
// The API imports from here; this avoids any circular dependency.

const ALLOWED_YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
]);

// Patterns that indicate SSRF attempts
const SSRF_PATTERNS = [
  /localhost/i,
  /(^|\/|@)127\.\d+\.\d+\.\d+/,
  /(^|\/|@)192\.168\.\d+\.\d+/,
  /(^|\/|@)10\.\d+\.\d+\.\d+/,
  /(^|\/|@)172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/,
  /\[::1\]/i,
  /0\.0\.0\.0/,
  /169\.254\./,
];

/**
 * Validates a YouTube URL for use with yt-dlp.
 *
 * Enforces:
 * - HTTPS only
 * - YouTube domain allowlist
 * - String-level SSRF defense patterns
 */
export function validateVideoUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    if (url.protocol !== "https:") return false;
    if (!ALLOWED_YT_HOSTS.has(url.hostname)) return false;

    for (const pattern of SSRF_PATTERNS) {
      if (pattern.test(urlString)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

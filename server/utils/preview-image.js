const dns = require("node:dns");
const https = require("node:https");
const net = require("node:net");

const MAX_HTML_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/x-png",
  "image/webp",
]);

function isPublicIp(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.includes("%") || normalized.startsWith("::ffff:")) return false;
    const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
    if (firstHextet < 0x2000 || firstHextet > 0x3fff) return false;
    if (normalized.startsWith("2001:db8:") || normalized.startsWith("2002:") || normalized.startsWith("2001:0:")) return false;
    return true;
  }

  return false;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function getAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp("(?:^|\\s)" + escaped + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3]) : "";
}

function extractImageFromHtml(html, baseUrl) {
  const candidates = [];
  const metaTags = String(html || "").match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const key = (getAttribute(tag, "property") || getAttribute(tag, "name")).toLowerCase();
    if (["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(key)) {
      const content = getAttribute(tag, "content");
      if (content) candidates.push(content);
    }
  }

  for (const candidate of candidates) {
    try {
      const imageUrl = new URL(candidate, baseUrl);
      if (imageUrl.protocol === "https:" && !imageUrl.username && !imageUrl.password) return imageUrl.toString();
    } catch {
      // Ignore malformed metadata and try the next candidate.
    }
  }
  return null;
}

function parseSafeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid image URL or sharing link.");
  }

  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Image links must use a public HTTPS address.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("That image host is not publicly accessible.");
  }

  url.hash = "";
  return url;
}

async function getPublicAddress(hostname) {
  let records;
  try {
    records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("The image host could not be reached.");
  }

  if (!records.length || records.some(record => !isPublicIp(record.address))) {
    throw new Error("That link does not point to a safe public image host.");
  }

  return records[0];
}

function requestUrl(url) {
  return new Promise(async (resolve, reject) => {
    let address;
    try {
      address = await getPublicAddress(url.hostname);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve(value);
    };

    const lookup = (_hostname, options, callback) => {
      if (options && options.all) {
        callback(null, [{ address: address.address, family: address.family }]);
      } else {
        callback(null, address.address, address.family);
      }
    };

    const request = https.get(url, {
      lookup,
      servername: url.hostname,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,text/html;q=0.9,*/*;q=0.5",
        "User-Agent": "Mozilla/5.0 (compatible; KuttPreviewResolver/1.0)",
        Range: "bytes=0-" + (MAX_HTML_BYTES - 1),
      },
      timeout: REQUEST_TIMEOUT_MS,
    }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.destroy();
        return finish(null, { redirect: location || null });
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        return finish(new Error("The image host returned an unsuccessful response."));
      }

      const contentType = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (IMAGE_TYPES.has(contentType)) {
        response.destroy();
        return finish(null, { imageUrl: url.toString(), contentType });
      }
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        response.destroy();
        return finish(new Error("That link does not return a supported image or a public sharing page."));
      }

      const chunks = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > MAX_HTML_BYTES) {
          response.destroy();
          finish(new Error("The sharing page is too large to inspect."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => finish(null, {
        html: Buffer.concat(chunks).toString("utf8"),
        contentType,
      }));
      response.on("error", error => finish(error));
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error("Image host timed out.")));
    request.on("error", error => finish(error));
  });
}

async function resolvePreviewImageUrl(input) {
  let currentUrl = parseSafeUrl(input);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response;
    try {
      response = await requestUrl(currentUrl);
    } catch (error) {
      if (error.message && /safe public|publicly accessible|HTTPS address|valid image URL/.test(error.message)) throw error;
      throw new Error("The image link could not be checked. Make sure it is public and try again.");
    }

    if (response.redirect) {
      if (hop === MAX_REDIRECTS) throw new Error("The image host redirected too many times.");
      try {
        currentUrl = parseSafeUrl(new URL(response.redirect, currentUrl).toString());
      } catch (error) {
        throw new Error(error.message || "The image host redirected to an unsupported address.");
      }
      continue;
    }

    if (response.imageUrl) return response.imageUrl;

    const imageUrl = extractImageFromHtml(response.html, currentUrl);
    if (!imageUrl) {
      throw new Error("No public image was found on that page. Try a direct image link or make the image publicly accessible.");
    }

    if (imageUrl === currentUrl.toString()) {
      throw new Error("The sharing page points back to itself instead of an image.");
    }

    // Check the extracted image itself rather than trusting a metadata URL.
    currentUrl = parseSafeUrl(imageUrl);
  }

  throw new Error("Could not resolve that sharing link to an image.");
}

module.exports = {
  resolvePreviewImageUrl,
  _internals: { isPublicIp, extractImageFromHtml, parseSafeUrl, decodeHtml },
};

const dns = require("node:dns");
const https = require("node:https");
const net = require("node:net");

const MAX_HTML_BYTES = 512 * 1024;
const MAX_SIGNATURE_BYTES = 64;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESOLVE_TIME_MS = 7000;
const MAX_REDIRECTS = 4;
const BROWSER_USER_AGENT = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;

// Errors whose message is safe and useful to show to the person creating the link.
function userError(message) {
  const error = new Error(message);
  error.userFacing = true;
  return error;
}

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
    // NAT64 prefix can embed private IPv4 addresses.
    if (normalized.startsWith("64:ff9b:")) return false;
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

// Identify the real image type from its first bytes, not from the Content-Type header.
function sniffImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return "image/bmp";
  return null;
}

// Identify MP4 or WebM from the container signature. Other MP4-family brands (still images, QuickTime) are rejected.
function sniffVideoType(buffer) {
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (["avif", "avis", "heic", "heix", "mif1", "msf1", "qt  "].includes(brand)) return null;
    return "video/mp4";
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "video/webm";
  return null;
}

function parseSafeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw userError("Enter a valid image URL or sharing link.");
  }

  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw userError("Media links must use a public HTTPS address.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw userError("That media host is not publicly accessible.");
  }

  url.hash = "";
  return url;
}

async function getPublicAddress(hostname) {
  let records;
  try {
    records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw userError(`The host ${hostname} could not be reached.`);
  }

  if (!records.length || records.some(record => !isPublicIp(record.address))) {
    throw userError("That link does not point to a safe public host.");
  }

  return records[0];
}

// Fetches one URL with DNS pinning. Returns one of:
//   { redirect }                              the host sent a redirect
//   { kind: "media", type, contentLength }    bytes matched the sniffer
//   { kind: "html", html }                    a web page
//   { kind: "other", contentType }            anything else
function requestUrl(url, timeoutMs = REQUEST_TIMEOUT_MS, sniffer = sniffImageType) {
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

    const requestTimeout = Math.max(1, Math.min(REQUEST_TIMEOUT_MS, timeoutMs));
    const request = https.get(url, {
      lookup,
      servername: url.hostname,
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": BROWSER_USER_AGENT,
      },
      timeout: requestTimeout,
    }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        return finish(null, { redirect: response.headers.location || null });
      }
      if (status < 200 || status >= 300) {
        response.resume();
        return finish(userError(`${url.hostname} responded with HTTP ${status}. The file may be private, removed, or blocking automated requests.`));
      }

      const contentType = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const contentLength = Number.parseInt(response.headers["content-length"] || "", 10) || null;
      const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
      const limit = isHtml ? MAX_HTML_BYTES : MAX_SIGNATURE_BYTES;
      const chunks = [];
      let size = 0;

      const build = buffer => {
        if (isHtml) return { kind: "html", html: buffer.toString("utf8") };
        const type = sniffer(buffer);
        if (type) return { kind: "media", type, contentLength };
        return { kind: "other", contentType: contentType || "unknown content type" };
      };

      response.on("data", chunk => {
        chunks.push(chunk);
        size += chunk.length;
        if (size >= limit) {
          response.destroy();
          finish(null, build(Buffer.concat(chunks).subarray(0, limit)));
        }
      });
      response.on("end", () => finish(null, build(Buffer.concat(chunks))));
      response.on("error", error => finish(error));
    });

    request.setTimeout(requestTimeout, () => request.destroy(new Error("Host timed out.")));
    request.on("error", error => finish(error));
  });
}


const MAX_PREVIEW_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 12000;

async function requestImageBuffer(url, timeoutMs = IMAGE_FETCH_TIMEOUT_MS) {
  const address = await getPublicAddress(url.hostname);
  return new Promise((resolve, reject) => {
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
    const requestTimeout = Math.max(1, Math.min(IMAGE_FETCH_TIMEOUT_MS, timeoutMs));
    const request = https.get(url, {
      lookup,
      servername: url.hostname,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
      },
      timeout: requestTimeout,
    }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        return finish(null, { redirect: response.headers.location || null });
      }
      if (status !== 200) {
        response.resume();
        return finish(userError(`${url.hostname} returned HTTP ${status} while loading the preview image.`));
      }

      const declaredSize = Number.parseInt(response.headers["content-length"] || "", 10);
      if (Number.isFinite(declaredSize) && declaredSize > MAX_PREVIEW_IMAGE_BYTES) {
        response.destroy();
        return finish(userError("The preview image is larger than the 10 MB processing limit."));
      }

      const contentType = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (contentType.startsWith("text/") || contentType.includes("html") || contentType.includes("xml")) {
        response.resume();
        return finish(userError("The saved preview URL returned a web page instead of an image."));
      }

      const chunks = [];
      let size = 0;
      response.on("data", chunk => {
        if (settled) return;
        size += chunk.length;
        if (size > MAX_PREVIEW_IMAGE_BYTES) {
          response.destroy();
          return finish(userError("The preview image is larger than the 10 MB processing limit."));
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) return;
        const buffer = Buffer.concat(chunks);
        const mimeType = sniffImageType(buffer);
        if (!mimeType) return finish(userError("The saved preview URL no longer contains a supported image."));
        return finish(null, { buffer, mimeType });
      });
      response.on("error", error => finish(error));
    });
    request.on("timeout", () => request.destroy(new Error("Preview image request timed out.")));
    request.on("error", error => finish(error));
  });
}

/**
 * Retrieve a previously verified image URL using the same DNS pinning and
 * per-hop private-address checks as the resolver. Never accepts an arbitrary
 * request URL from the browser; callers must load the URL from the link row.
 */
async function fetchPublicImageBuffer(input) {
  let currentUrl = parseSafeUrl(input);
  const deadline = Date.now() + IMAGE_FETCH_TIMEOUT_MS;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw userError("The preview image provider timed out.");
    const result = await requestImageBuffer(currentUrl, remainingMs);
    if (result.redirect) {
      if (hop === MAX_REDIRECTS) throw userError("The preview image host redirected too many times.");
      currentUrl = parseSafeUrl(new URL(result.redirect, currentUrl).toString());
      continue;
    }
    return result;
  }

  throw userError("Could not retrieve the saved preview image.");
}

async function resolvePreviewImageUrl(input) {
  let currentUrl = parseSafeUrl(input);
  const deadline = Date.now() + MAX_RESOLVE_TIME_MS;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw userError("The image provider took too long to respond. Try a direct image URL.");

    let response;
    try {
      response = await requestUrl(currentUrl, remainingMs, sniffImageType);
    } catch (error) {
      if (error.userFacing) throw error;
      throw userError(`The image link could not be checked (${error.message || "network error"}). Make sure it is public and try again.`);
    }

    if (response.redirect) {
      if (hop === MAX_REDIRECTS) throw userError("The image host redirected too many times.");
      try {
        currentUrl = parseSafeUrl(new URL(response.redirect, currentUrl).toString());
      } catch (error) {
        throw userError(error.message || "The image host redirected to an unsupported address.");
      }
      continue;
    }

    if (response.kind === "media") return currentUrl.toString();

    if (response.kind === "other") {
      throw userError(`${currentUrl.hostname} returned ${response.contentType}, not an image. Try a direct image link.`);
    }

    // The response is a web page.
    if (IMAGE_EXTENSION.test(currentUrl.pathname)) {
      throw userError(`${currentUrl.hostname} returned a web page instead of the image. The file may be private, removed, or blocking automated requests. Try a public direct link or upload the image to another host.`);
    }

    const imageUrl = extractImageFromHtml(response.html, currentUrl);
    if (!imageUrl) {
      throw userError("No public image was found on that page. Try a direct image link or make the image publicly accessible.");
    }
    if (imageUrl === currentUrl.toString()) {
      throw userError("The sharing page points back to itself instead of an image.");
    }

    // Verify the extracted image itself rather than trusting the metadata URL.
    currentUrl = parseSafeUrl(imageUrl);
  }

  throw userError("Could not resolve that sharing link to an image.");
}

// Validates a direct video link. Returns the URL and the verified MIME type (video/mp4 or video/webm).
async function resolvePreviewVideoUrl(input) {
  let currentUrl = parseSafeUrl(input);
  const deadline = Date.now() + MAX_RESOLVE_TIME_MS;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw userError("The video host took too long to respond.");

    let response;
    try {
      response = await requestUrl(currentUrl, remainingMs, sniffVideoType);
    } catch (error) {
      if (error.userFacing) throw error;
      throw userError(`The video link could not be checked (${error.message || "network error"}). Make sure it is public and try again.`);
    }

    if (response.redirect) {
      if (hop === MAX_REDIRECTS) throw userError("The video host redirected too many times.");
      try {
        currentUrl = parseSafeUrl(new URL(response.redirect, currentUrl).toString());
      } catch (error) {
        throw userError(error.message || "The video host redirected to an unsupported address.");
      }
      continue;
    }

    if (response.kind === "media") {
      if (response.contentLength && response.contentLength > MAX_VIDEO_BYTES) {
        throw userError("That video is larger than 100 MB and is too large for link previews.");
      }
      return { url: currentUrl.toString(), mimeType: response.type };
    }

    throw userError(`${currentUrl.hostname} did not return an MP4 or WebM video. Use a direct link to a public .mp4 or .webm file.`);
  }

  throw userError("Could not verify that video link.");
}

module.exports = {
  resolvePreviewImageUrl,
  resolvePreviewVideoUrl,
  fetchPublicImageBuffer,
  _internals: { isPublicIp, extractImageFromHtml, parseSafeUrl, decodeHtml, sniffImageType, sniffVideoType, requestImageBuffer, requestUrl },
};

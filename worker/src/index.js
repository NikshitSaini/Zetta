/**
 * Cloudflare Worker — Telegram Storage Relay
 *
 * Routes:
 *   POST /upload-chunk   — Accepts a file chunk (multipart/form-data),
 *                          verifies the JWT upload token, forwards to Telegram
 *                          sendDocument, returns { ok, telegramFileId, chunkIndex }.
 *
 *   GET  /download/:fileId — Fetches the file manifest from the Render backend,
 *                            then streams all Telegram chunks sequentially to the
 *                            browser as a single reconstructed file.
 *
 *   OPTIONS *            — CORS preflight handler.
 *
 * Secrets (set via `npx wrangler secret put <NAME>`):
 *   TELEGRAM_BOT_TOKEN   — Bot token from @BotFather
 *   TELEGRAM_CHANNEL_ID  — Private channel ID (e.g. -100XXXXXXXXXX)
 *   JWT_SECRET           — Shared with Render backend for upload token verification
 *
 * Vars (set in wrangler.toml [vars]):
 *   RENDER_BACKEND_URL   — Your Render app base URL (no trailing slash)
 *   WORKER_KEY           — Shared secret sent as X-Worker-Key to the manifest endpoint
 */

// ─── CORS Headers ────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function corsResponse(body, init = {}) {
  const response = new Response(body, init);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

function corsJson(data, status = 200) {
  return corsResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── JWT Verification (Web Crypto — no library) ───────────────────────────────

/**
 * Verifies a HS256 JWT using the native SubtleCrypto API.
 * Returns the decoded payload on success, throws on failure.
 */
async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  const [headerB64, payloadB64, signatureB64] = parts;

  // Import the HMAC-SHA256 key
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Verify the signature
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);

  const isValid = await crypto.subtle.verify(
    "HMAC",
    cryptoKey,
    signature,
    encoder.encode(signingInput)
  );

  if (!isValid) throw new Error("Invalid JWT signature");

  // Decode payload
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));

  // Check expiry
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error("JWT expired");
  }

  return payload;
}

function base64UrlDecode(str) {
  // Convert base64url to base64
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ─── Upload Handler ───────────────────────────────────────────────────────────

async function handleUploadChunk(request, env) {
  // 1. Extract and verify JWT
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return corsJson({ error: "Missing Authorization header" }, 401);
  }

  try {
    await verifyJwt(token, env.JWT_SECRET);
  } catch (err) {
    return corsJson({ error: `Unauthorized: ${err.message}` }, 401);
  }

  // 2. Parse multipart form data
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return corsJson({ error: "Invalid multipart form data" }, 400);
  }

  const fileBlob = formData.get("document");
  const chunkIndex = formData.get("chunkIndex");

  if (!fileBlob || chunkIndex === null) {
    return corsJson({ error: "Missing required fields: document, chunkIndex" }, 400);
  }

  // 3. Forward to Telegram sendDocument
  const tgFormData = new FormData();
  tgFormData.append("chat_id", env.TELEGRAM_CHANNEL_ID);
  tgFormData.append("document", fileBlob);

  const tgUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`;

  let tgResponse;
  try {
    tgResponse = await fetch(tgUrl, { method: "POST", body: tgFormData });
  } catch (err) {
    return corsJson({ error: `Failed to reach Telegram API: ${err.message}` }, 502);
  }

  const tgData = await tgResponse.json();

  // 4. Handle Telegram rate limiting
  if (tgResponse.status === 429) {
    const retryAfter = tgData.parameters?.retry_after ?? 5;
    return corsJson(
      { error: "Telegram rate limit hit", retryAfter },
      429
    );
  }

  if (!tgData.ok) {
    return corsJson(
      { error: `Telegram error: ${tgData.description}` },
      502
    );
  }

  // 5. Extract the Telegram file_id
  const telegramFileId =
    tgData.result?.document?.file_id ??
    tgData.result?.video?.file_id ??
    tgData.result?.audio?.file_id ??
    tgData.result?.photo?.[tgData.result.photo.length - 1]?.file_id;

  if (!telegramFileId) {
    return corsJson({ error: "Could not extract file_id from Telegram response" }, 502);
  }

  return corsJson({
    ok: true,
    telegramFileId,
    chunkIndex: Number(chunkIndex),
  });
}

// ─── Download Handler ─────────────────────────────────────────────────────────

async function handleDownload(request, env, fileId) {
  // 1. Fetch manifest from Render backend
  const manifestUrl = `${env.RENDER_BACKEND_URL}/api/files/${fileId}/manifest`;
  let manifestRes;
  try {
    manifestRes = await fetch(manifestUrl, {
      headers: { "X-Worker-Key": env.WORKER_KEY },
    });
  } catch (err) {
    return corsJson({ error: `Failed to reach backend: ${err.message}` }, 502);
  }

  if (!manifestRes.ok) {
    const text = await manifestRes.text();
    return corsJson(
      { error: `Manifest fetch failed (${manifestRes.status}): ${text}` },
      manifestRes.status
    );
  }

  const manifest = await manifestRes.json();
  const { originalName, mimeType, totalSize, chunks } = manifest;

  // Sort chunks by index to guarantee correct reconstruction order
  const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);

  // 2. Build a ReadableStream that pipes all chunks sequentially
  const botToken = env.TELEGRAM_BOT_TOKEN;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const chunk of sortedChunks) {
          // Resolve the Telegram file path
          const getFileRes = await fetch(
            `https://api.telegram.org/bot${botToken}/getFile?file_id=${chunk.telegramFileId}`
          );
          const getFileData = await getFileRes.json();

          if (!getFileData.ok) {
            throw new Error(
              `getFile failed for chunk ${chunk.index}: ${getFileData.description}`
            );
          }

          const filePath = getFileData.result.file_path;
          const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

          // Stream the chunk bytes into the response
          const chunkRes = await fetch(fileUrl);
          if (!chunkRes.ok) {
            throw new Error(
              `Chunk download failed (${chunkRes.status}) for chunk ${chunk.index}`
            );
          }

          const reader = chunkRes.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  // 3. Return the streaming response
  const headers = new Headers({
    ...CORS_HEADERS,
    "Content-Type": mimeType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(originalName)}"`,
  });

  // Only set Content-Length if we know the exact size
  if (totalSize) {
    headers.set("Content-Length", String(totalSize));
  }

  return new Response(stream, { status: 200, headers });
}

// ─── Main Fetch Handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, method } = Object.assign(url, { method: request.method });

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // POST /upload-chunk
    if (method === "POST" && pathname === "/upload-chunk") {
      return handleUploadChunk(request, env);
    }

    // GET /download/:fileId
    const downloadMatch = pathname.match(/^\/download\/([^/]+)$/);
    if (method === "GET" && downloadMatch) {
      const fileId = downloadMatch[1];
      return handleDownload(request, env, fileId);
    }

    // 404 for everything else
    return corsJson({ error: "Not found" }, 404);
  },
};

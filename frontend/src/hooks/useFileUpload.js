import { useState, useRef, useCallback } from "react";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

/** 19 MB — safely below Telegram's 20 MB getFile hard limit */
const CHUNK_SIZE = 19 * 1024 * 1024;

/** Max retry attempts per chunk */
const MAX_RETRIES = 6;

/**
 * useFileUpload — chunking upload engine
 *
 * Exposes:
 *   uploadFile(file)  → { fileId, name, size, mimeType, downloadUrl } | null
 *   cancelUpload()
 *   isUploading       boolean
 *   uploadedBytes     number  (bytes sent so far)
 *   totalBytes        number  (total file bytes)
 *   uploadSpeed       number  (bytes/sec, rolling average)
 *   error             string | null
 *   fileName          string | null
 */
export default function useFileUpload() {
  const [isUploading, setIsUploading]     = useState(false);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes]       = useState(0);
  const [uploadSpeed, setUploadSpeed]     = useState(0); // bytes/sec
  const [error, setError]                 = useState(null);
  const [fileName, setFileName]           = useState(null);

  const abortRef       = useRef(null);
  const speedTracker   = useRef({ lastTime: 0, lastBytes: 0 });

  const uploadFile = useCallback(async (file) => {
    if (!file) return null;

    setIsUploading(true);
    setUploadedBytes(0);
    setTotalBytes(file.size);
    setUploadSpeed(0);
    setError(null);
    setFileName(file.name);
    speedTracker.current = { lastTime: Date.now(), lastBytes: 0 };

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      const numChunks = Math.ceil(file.size / CHUNK_SIZE);

      // ── Step 1: Init ──────────────────────────────────────────────────────
      const initRes = await axiosInstance.post("/files/init", {
        originalName:  file.name,
        mimeType:      file.type || "application/octet-stream",
        totalSize:     file.size,
        totalChunks:   numChunks,
      });

      const { fileId, uploadToken, workerUrl } = initRes.data;
      const uploadedChunks = [];
      let cumulativeBytes  = 0;

      // ── Step 2: Upload chunks ─────────────────────────────────────────────
      for (let i = 0; i < numChunks; i++) {
        if (signal.aborted) return null;

        const blob = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const formData = new FormData();
        formData.append("document",   blob, `chunk_${i}_${file.name}`);
        formData.append("chunkIndex", String(i));

        let attempt     = 0;
        let chunkResult = null;

        while (attempt < MAX_RETRIES) {
          if (signal.aborted) return null;
          attempt++;

          try {
            const chunkRes = await fetch(`${workerUrl}/upload-chunk`, {
              method:  "POST",
              headers: { Authorization: `Bearer ${uploadToken}` },
              body:    formData,
              signal,
            });

            if (chunkRes.status === 429 || chunkRes.status === 503) {
              const data = await chunkRes.json().catch(() => ({}));
              const wait = (data.retryAfter ?? Math.pow(2, attempt) * 3) * 1000;
              console.warn(`Server busy/rate-limited (${chunkRes.status}) on chunk ${i}, attempt ${attempt}, waiting ${wait}ms`);
              await delay(wait, signal);
              continue;
            }

            if (!chunkRes.ok) {
              const data = await chunkRes.json().catch(() => ({}));
              throw new Error(data.error || `HTTP ${chunkRes.status}`);
            }

            const data = await chunkRes.json();
            chunkResult = { index: i, telegramFileId: data.telegramFileId, size: blob.size };
            break;
          } catch (err) {
            if (signal.aborted || err.name === "AbortError") return null;
            if (attempt >= MAX_RETRIES) throw err;
            const backoff = Math.min(Math.pow(2, attempt) * 2000, 30000);
            console.warn(`Chunk ${i} attempt ${attempt} failed (${err.message}), retrying in ${backoff}ms`);
            await delay(backoff, signal);
          }
        }

        if (!chunkResult) throw new Error(`Failed to upload chunk ${i} after ${MAX_RETRIES} attempts`);
        uploadedChunks.push(chunkResult);

        // Update bytes + rolling speed
        cumulativeBytes += blob.size;
        setUploadedBytes(cumulativeBytes);

        const now     = Date.now();
        const elapsed = (now - speedTracker.current.lastTime) / 1000;
        if (elapsed >= 0.5) {
          const delta = cumulativeBytes - speedTracker.current.lastBytes;
          setUploadSpeed(delta / elapsed);
          speedTracker.current = { lastTime: now, lastBytes: cumulativeBytes };
        }

        // 2 s pacing between chunks (respects Telegram 20 msgs/min rate limit)
        if (i < numChunks - 1) await delay(2000, signal);
      }

      if (signal.aborted) return null;

      // ── Step 3: Finalize ──────────────────────────────────────────────────
      await axiosInstance.post("/files/finalize", { fileId, chunks: uploadedChunks });

      return {
        fileId,
        name:        file.name,
        size:        file.size,
        mimeType:    file.type || "application/octet-stream",
        downloadUrl: `${workerUrl}/download/${fileId}`,
      };
    } catch (err) {
      if (err.name === "AbortError" || signal.aborted) return null;
      console.error("uploadFile error:", err);
      const msg = err.response?.data?.message || err.message || "Upload failed";
      setError(msg);
      toast.error(`Upload failed: ${msg}`);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const cancelUpload = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setIsUploading(false);
    setUploadedBytes(0);
    setTotalBytes(0);
    setUploadSpeed(0);
    setError(null);
    setFileName(null);
  }, []);

  return { uploadFile, cancelUpload, isUploading, uploadedBytes, totalBytes, uploadSpeed, error, fileName };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

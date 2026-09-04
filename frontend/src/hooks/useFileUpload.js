import { useState, useRef, useCallback } from "react";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

/** 19 MB — safely below Telegram's 20 MB getFile hard limit */
const CHUNK_SIZE = 19 * 1024 * 1024;

/** Max retry attempts per chunk */
const MAX_RETRIES = 3;

/**
 * useFileUpload — chunking upload engine
 *
 * Usage:
 *   const { uploadFile, cancelUpload, isUploading, progress, currentChunk, totalChunks, error, fileName } = useFileUpload();
 *
 *   const result = await uploadFile(file);
 *   // result: { fileId, name, size, mimeType, downloadUrl }  — or null if cancelled/failed
 */
export default function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);       // 0-100
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);

  // AbortController for cancellation
  const abortRef = useRef(null);

  /**
   * Uploads a file in 19 MB chunks through the Cloudflare Worker relay.
   * Returns the file attachment object on success, or null if cancelled/failed.
   */
  const uploadFile = useCallback(async (file) => {
    if (!file) return null;

    setIsUploading(true);
    setProgress(0);
    setError(null);
    setFileName(file.name);

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      const numChunks = Math.ceil(file.size / CHUNK_SIZE);
      setTotalChunks(numChunks);
      setCurrentChunk(0);

      // ── Step 1: Init upload (get fileId + uploadToken + workerUrl) ──────────
      const initRes = await axiosInstance.post("/files/init", {
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        totalSize: file.size,
        totalChunks: numChunks,
      });

      const { fileId, uploadToken, workerUrl } = initRes.data;

      // ── Step 2: Upload chunks sequentially ────────────────────────────────
      const uploadedChunks = [];

      for (let i = 0; i < numChunks; i++) {
        if (signal.aborted) return null;

        setCurrentChunk(i + 1);

        const blob = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const formData = new FormData();
        // Name the blob so Telegram preserves the original filename
        formData.append("document", blob, `chunk_${i}_${file.name}`);
        formData.append("chunkIndex", String(i));

        // Retry loop with exponential backoff
        let attempt = 0;
        let chunkResult = null;

        while (attempt < MAX_RETRIES) {
          if (signal.aborted) return null;
          attempt++;

          try {
            const chunkRes = await fetch(`${workerUrl}/upload-chunk`, {
              method: "POST",
              headers: { Authorization: `Bearer ${uploadToken}` },
              body: formData,
              signal,
            });

            if (chunkRes.status === 429) {
              // Respect Telegram's retry_after
              const data = await chunkRes.json();
              const wait = (data.retryAfter ?? 5) * 1000;
              console.warn(`Rate limited on chunk ${i}, waiting ${wait}ms`);
              await delay(wait, signal);
              continue; // retry same attempt
            }

            if (!chunkRes.ok) {
              const data = await chunkRes.json().catch(() => ({}));
              throw new Error(data.error || `HTTP ${chunkRes.status}`);
            }

            const data = await chunkRes.json();
            chunkResult = {
              index: i,
              telegramFileId: data.telegramFileId,
              size: blob.size,
            };
            break; // success — exit retry loop
          } catch (err) {
            if (signal.aborted || err.name === "AbortError") return null;
            if (attempt >= MAX_RETRIES) throw err;

            // Exponential backoff: 2s, 4s, 8s
            const backoff = Math.pow(2, attempt) * 1000;
            console.warn(`Chunk ${i} attempt ${attempt} failed (${err.message}), retrying in ${backoff}ms`);
            await delay(backoff, signal);
          }
        }

        if (!chunkResult) throw new Error(`Failed to upload chunk ${i} after ${MAX_RETRIES} attempts`);
        uploadedChunks.push(chunkResult);

        // Update progress
        setProgress(Math.round(((i + 1) / numChunks) * 100));

        // ── Rate-limit pacing: 1 second between chunks ──────────────────────
        if (i < numChunks - 1) {
          await delay(1000, signal);
        }
      }

      if (signal.aborted) return null;

      // ── Step 3: Finalize ──────────────────────────────────────────────────
      await axiosInstance.post("/files/finalize", {
        fileId,
        chunks: uploadedChunks,
      });

      return {
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
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

  /** Cancels any in-progress upload immediately */
  const cancelUpload = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsUploading(false);
    setProgress(0);
    setCurrentChunk(0);
    setTotalChunks(0);
    setError(null);
    setFileName(null);
  }, []);

  return {
    uploadFile,
    cancelUpload,
    isUploading,
    progress,
    currentChunk,
    totalChunks,
    error,
    fileName,
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Promise-based delay that rejects immediately if the abort signal fires.
 */
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

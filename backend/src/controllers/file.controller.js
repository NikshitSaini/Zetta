import jwt from "jsonwebtoken";
import FileMetadata from "../models/file.model.js";

// ─── initUpload ───────────────────────────────────────────────────────────────
/**
 * POST /api/files/init
 * Body: { originalName, mimeType, totalSize, totalChunks }
 *
 * Creates a pending FileMetadata document and returns an ephemeral JWT upload
 * token (2h TTL) plus the Cloudflare Worker URL.
 */
export const initUpload = async (req, res) => {
  try {
    const { originalName, mimeType, totalSize, totalChunks } = req.body;

    // Validation
    if (!originalName || !mimeType || !totalSize || !totalChunks) {
      return res.status(400).json({ message: "Missing required fields: originalName, mimeType, totalSize, totalChunks" });
    }
    if (typeof totalSize !== "number" || totalSize <= 0) {
      return res.status(400).json({ message: "totalSize must be a positive number" });
    }
    if (typeof totalChunks !== "number" || totalChunks < 1) {
      return res.status(400).json({ message: "totalChunks must be >= 1" });
    }

    // Create pending metadata record
    const file = await FileMetadata.create({
      uploaderId: req.user._id,
      originalName,
      mimeType,
      totalSize,
      totalChunks,
      chunks: [],
      status: "pending",
    });

    // Sign a short-lived upload token (2h)
    const uploadToken = jwt.sign(
      { fileId: file._id, uploaderId: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.status(201).json({
      fileId: file._id,
      uploadToken,
      workerUrl: process.env.WORKER_URL,
    });
  } catch (error) {
    console.error("initUpload error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── finalizeUpload ───────────────────────────────────────────────────────────
/**
 * POST /api/files/finalize
 * Body: { fileId, chunks: [{ index, telegramFileId, size }] }
 *
 * Validates the chunk manifest and marks the upload as completed.
 */
export const finalizeUpload = async (req, res) => {
  try {
    const { fileId, chunks } = req.body;

    if (!fileId || !Array.isArray(chunks)) {
      return res.status(400).json({ message: "Missing required fields: fileId, chunks[]" });
    }

    const file = await FileMetadata.findById(fileId);

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    if (file.uploaderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Forbidden: not your upload" });
    }
    if (file.status !== "pending") {
      return res.status(409).json({ message: `Upload is already in status: ${file.status}` });
    }

    // Validate chunk count
    if (chunks.length !== file.totalChunks) {
      return res.status(400).json({
        message: `Expected ${file.totalChunks} chunks, received ${chunks.length}`,
      });
    }

    // Validate all indices are present (0 .. totalChunks-1)
    const indices = chunks.map((c) => c.index).sort((a, b) => a - b);
    const expectedIndices = Array.from({ length: file.totalChunks }, (_, i) => i);
    const allIndicesPresent = expectedIndices.every((i) => indices.includes(i));
    if (!allIndicesPresent) {
      return res.status(400).json({ message: "Missing chunk indices — all chunks must be uploaded before finalizing" });
    }

    // Validate each chunk has the required fields
    for (const chunk of chunks) {
      if (typeof chunk.index !== "number" || !chunk.telegramFileId || typeof chunk.size !== "number") {
        return res.status(400).json({
          message: `Chunk at index ${chunk.index} is missing required fields (index, telegramFileId, size)`,
        });
      }
    }

    // Validate total size (±1MB tolerance for last-chunk padding differences)
    const totalChunkSize = chunks.reduce((sum, c) => sum + c.size, 0);
    const tolerance = 1 * 1024 * 1024; // 1MB
    if (Math.abs(totalChunkSize - file.totalSize) > tolerance) {
      return res.status(400).json({
        message: `Chunk sizes total (${totalChunkSize}) doesn't match declared totalSize (${file.totalSize}) within ±1MB tolerance`,
      });
    }

    // Commit
    file.chunks = chunks.sort((a, b) => a.index - b.index);
    file.status = "completed";
    const savedFile = await file.save();

    return res.status(200).json({
      success: true,
      file: savedFile,
    });
  } catch (error) {
    console.error("finalizeUpload error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── getFileManifest ──────────────────────────────────────────────────────────
/**
 * GET /api/files/:fileId/manifest
 *
 * Called by the Cloudflare Worker during downloads. Validates a shared secret
 * (X-Worker-Key) instead of user auth, to keep this endpoint inaccessible to
 * public browsers while still being callable by the Worker.
 *
 * Returns: { originalName, mimeType, totalSize, chunks[] }
 */
export const getFileManifest = async (req, res) => {
  try {
    // Validate the shared Worker key
    const workerKey = req.headers["x-worker-key"];
    if (!workerKey || workerKey !== process.env.WORKER_KEY) {
      return res.status(401).json({ message: "Unauthorized: invalid or missing X-Worker-Key" });
    }

    const { fileId } = req.params;
    const file = await FileMetadata.findOne({ _id: fileId, status: "completed" }).lean();

    if (!file) {
      return res.status(404).json({ message: "File not found or not yet completed" });
    }

    // Return only what the Worker needs
    return res.status(200).json({
      originalName: file.originalName,
      mimeType: file.mimeType,
      totalSize: file.totalSize,
      chunks: file.chunks.sort((a, b) => a.index - b.index),
    });
  } catch (error) {
    console.error("getFileManifest error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── getUserFiles ─────────────────────────────────────────────────────────────
/**
 * GET /api/files/my-files
 *
 * Returns all completed files uploaded by the authenticated user,
 * sorted newest-first.
 */
export const getUserFiles = async (req, res) => {
  try {
    const files = await FileMetadata.find({
      uploaderId: req.user._id,
      status: "completed",
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(files);
  } catch (error) {
    console.error("getUserFiles error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

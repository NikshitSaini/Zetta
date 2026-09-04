import mongoose from "mongoose";

const chunkSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    telegramFileId: { type: String, required: true },
    size: { type: Number, required: true }, // bytes in this chunk
  },
  { _id: false }
);

const fileMetadataSchema = new mongoose.Schema(
  {
    uploaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    totalSize: { type: Number, required: true }, // total bytes
    totalChunks: { type: Number, required: true },
    chunks: [chunkSchema],
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Efficient "my files" queries
fileMetadataSchema.index({ uploaderId: 1, status: 1 });

// Auto-cleanup abandoned uploads after 24 hours
// Note: MongoDB TTL index only fires for documents where status === "pending"
// We handle this via a partial filter expression on the "pending" documents.
fileMetadataSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 86400, // 24 hours
    partialFilterExpression: { status: "pending" },
  }
);

const FileMetadata = mongoose.model("FileMetadata", fileMetadataSchema);

export default FileMetadata;

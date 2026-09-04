import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    image: {
      type: String,
    },
    file: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "FileMetadata" },
      name: { type: String },
      size: { type: Number },
      mimeType: { type: String },
      downloadUrl: { type: String }, // pre-built Cloudflare Worker download URL
    },
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;

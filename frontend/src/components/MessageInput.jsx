import { useRef, useState } from "react";
import useKeyboardSound from "../hooks/useKeyboardSound";
import useFileUpload from "../hooks/useFileUpload";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import { FileIcon, ImageIcon, Paperclip, SendIcon, XIcon } from "lucide-react";

// ── Formatters ─────────────────────────────────────────────────────────────────

/** "1.2 GB" | "540 MB" | "23 KB" | "512 B" */
function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** "1.4 MB/s" | "540 KB/s" | "12 B/s" */
function formatSpeed(bps) {
  if (!bps || bps <= 0) return "";
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  if (bps >= 1024)      return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

// ── Component ──────────────────────────────────────────────────────────────────

function MessageInput() {
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const [text, setText]             = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [pendingFile, setPendingFile]   = useState(null); // raw File object

  const imageInputRef = useRef(null);
  const docInputRef   = useRef(null);

  const { sendMessage, isSoundEnabled } = useChatStore();
  const {
    uploadFile,
    cancelUpload,
    isUploading,
    uploadedBytes,
    totalBytes,
    uploadSpeed,
  } = useFileUpload();

  // ── Send ────────────────────────────────────────────────────────────────────

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imagePreview && !pendingFile) return;
    if (isSoundEnabled) playRandomKeyStrokeSound();

    let filePayload = null;

    if (pendingFile) {
      filePayload = await uploadFile(pendingFile);
      if (!filePayload) return; // cancelled or failed — toast already shown
    }

    sendMessage({ text: text.trim(), image: imagePreview, file: filePayload || undefined });

    setText("");
    setImagePreview("");
    setPendingFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (docInputRef.current)   docInputRef.current.value   = "";
  };

  // ── File pickers ────────────────────────────────────────────────────────────

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeImage = () => { setImagePreview(null); if (imageInputRef.current) imageInputRef.current.value = ""; };
  const removeFile  = () => { setPendingFile(null);  if (docInputRef.current)   docInputRef.current.value   = ""; };

  // ── Derived upload stats ────────────────────────────────────────────────────

  const pct          = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
  const uploadedFmt  = formatBytes(uploadedBytes);
  const totalFmt     = formatBytes(totalBytes);
  const speedFmt     = formatSpeed(uploadSpeed);
  const canSend      = !!(text.trim() || imagePreview || pendingFile) && !isUploading;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 border-t border-slate-700/50">

      {/* ── Image preview ────────────────────────────────────────────────── */}
      {imagePreview && (
        <div className="mb-3 flex items-center">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-slate-700"
            />
            <button
              onClick={removeImage}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700"
              type="button"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Staged file preview (before upload) ─────────────────────────── */}
      {pendingFile && !isUploading && (
        <div className="mb-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/70 border border-slate-700/60">
            <FileIcon className="w-7 h-7 text-cyan-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{pendingFile.name}</p>
              <p className="text-xs text-slate-400">{formatBytes(pendingFile.size)}</p>
            </div>
            <button type="button" onClick={removeFile} className="text-slate-400 hover:text-slate-200 transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Upload progress ───────────────────────────────────────────────── */}
      {isUploading && (
        <div className="mb-3">
          <div className="px-4 py-3 rounded-xl bg-slate-800/70 border border-slate-700/60 overflow-hidden">

            {/* Header row */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {/* Spinning dot */}
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                </span>
                <span className="text-sm text-slate-300 truncate">
                  <span className="font-semibold text-white">{uploadedFmt}</span>
                  <span className="text-slate-400"> / {totalFmt}</span>
                  {speedFmt && (
                    <span className="ml-2 text-cyan-400 font-medium">· {speedFmt}</span>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={cancelUpload}
                className="text-xs text-red-400 hover:text-red-300 transition-colors shrink-0 ml-3 font-medium"
              >
                Cancel
              </button>
            </div>

            {/* Progress track with shimmer */}
            <div className="relative w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              {/* Filled bar */}
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
              {/* Shimmer overlay */}
              <div
                className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
                style={{ width: `${pct}%` }}
              >
                <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:200%_100%]" />
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-1">{pct}%</p>
          </div>
        </div>
      )}

      {/* ── Input row ─────────────────────────────────────────────────────── */}
      <form onSubmit={handleSendMessage} className="flex space-x-4">
        <input
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); isSoundEnabled && playRandomKeyStrokeSound(); }}
          className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg py-2 px-4 disabled:opacity-50"
          placeholder="Type your message..."
          disabled={isUploading}
        />

        {/* Hidden pickers */}
        <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageChange} className="hidden" />
        <input type="file" accept="*"       ref={docInputRef}   onChange={handleFileChange}  className="hidden" />

        {/* Image attach */}
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={isUploading}
          title="Attach image"
          className={`bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-3 transition-colors disabled:opacity-50 ${imagePreview ? "text-cyan-500" : ""}`}
        >
          <ImageIcon className="w-5 h-5" />
        </button>

        {/* File attach */}
        <button
          type="button"
          onClick={() => docInputRef.current?.click()}
          disabled={isUploading}
          title="Attach file"
          className={`bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-3 transition-colors disabled:opacity-50 ${pendingFile ? "text-cyan-500" : ""}`}
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Send */}
        <button
          type="submit"
          disabled={!canSend}
          className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg px-4 py-2 font-medium hover:from-cyan-600 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}

export default MessageInput;

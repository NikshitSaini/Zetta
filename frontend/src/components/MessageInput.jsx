import { useRef, useState } from "react";
import useKeyboardSound from "../hooks/useKeyboardSound";
import useFileUpload from "../hooks/useFileUpload";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import { FileIcon, ImageIcon, Paperclip, SendIcon, XIcon } from "lucide-react";

/** Returns human-readable file size (e.g. "1.2 GB", "540 MB", "23 KB", "512 B") */
function formatFileSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function MessageInput() {
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [pendingFile, setPendingFile] = useState(null); // raw File object

  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);

  const { sendMessage, isSoundEnabled } = useChatStore();
  const {
    uploadFile,
    cancelUpload,
    isUploading,
    progress,
    currentChunk,
    totalChunks,
  } = useFileUpload();

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imagePreview && !pendingFile) return;
    if (isSoundEnabled) playRandomKeyStrokeSound();

    let filePayload = null;

    // If a file is staged, upload it first
    if (pendingFile) {
      filePayload = await uploadFile(pendingFile);
      if (!filePayload) {
        // Upload was cancelled or failed — toast already shown by hook
        return;
      }
    }

    sendMessage({
      text: text.trim(),
      image: imagePreview,
      file: filePayload || undefined,
    });

    setText("");
    setImagePreview("");
    setPendingFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (docInputRef.current) docInputRef.current.value = "";
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    // Clear any staged image (can't send both at once)
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeImage = () => {
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeFile = () => {
    setPendingFile(null);
    if (docInputRef.current) docInputRef.current.value = "";
  };

  const canSend = (text.trim() || imagePreview || pendingFile) && !isUploading;

  return (
    <div className="p-4 border-t border-slate-700/50">
      {/* Image preview */}
      {imagePreview && (
        <div className="max-w-3xl mx-auto mb-3 flex items-center">
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

      {/* Staged file preview (before upload) */}
      {pendingFile && !isUploading && (
        <div className="max-w-3xl mx-auto mb-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/70 border border-slate-700/60">
            <FileIcon className="w-7 h-7 text-cyan-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{pendingFile.name}</p>
              <p className="text-xs text-slate-400">{formatFileSize(pendingFile.size)}</p>
            </div>
            <button
              type="button"
              onClick={removeFile}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Upload progress bar (replaces file preview while uploading) */}
      {isUploading && (
        <div className="max-w-3xl mx-auto mb-3">
          <div className="px-4 py-3 rounded-xl bg-slate-800/70 border border-slate-700/60">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-300 truncate pr-4">
                Uploading chunk{" "}
                <span className="font-semibold text-cyan-400">{currentChunk}</span>
                {" / "}
                <span className="font-semibold">{totalChunks}</span>
              </p>
              <button
                type="button"
                onClick={cancelUpload}
                className="text-xs text-red-400 hover:text-red-300 transition-colors shrink-0 font-medium"
              >
                Cancel
              </button>
            </div>
            {/* Progress track */}
            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">{progress}%</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex space-x-4">
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            isSoundEnabled && playRandomKeyStrokeSound();
          }}
          className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg py-2 px-4"
          placeholder="Type your message..."
          disabled={isUploading}
        />

        {/* Hidden image picker */}
        <input
          type="file"
          accept="image/*"
          ref={imageInputRef}
          onChange={handleImageChange}
          className="hidden"
        />

        {/* Hidden file picker (any type) */}
        <input
          type="file"
          accept="*"
          ref={docInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Image attach button */}
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={isUploading}
          className={`bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-3 transition-colors disabled:opacity-50 ${
            imagePreview ? "text-cyan-500" : ""
          }`}
          title="Attach image"
        >
          <ImageIcon className="w-5 h-5" />
        </button>

        {/* File attach button (📎) */}
        <button
          type="button"
          onClick={() => docInputRef.current?.click()}
          disabled={isUploading}
          className={`bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-3 transition-colors disabled:opacity-50 ${
            pendingFile ? "text-cyan-500" : ""
          }`}
          title="Attach file"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Send button */}
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

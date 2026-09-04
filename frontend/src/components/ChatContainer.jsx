import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import { Download, FileIcon, X } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ── Lightbox ───────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fadeIn cursor-zoom-out"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all z-10"
        aria-label="Close image"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Image — stopPropagation so clicking the image itself doesn't close */}
      <img
        src={src}
        alt="Full size"
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl cursor-default animate-zoomIn"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

function ChatContainer() {
  const {
    selectedUser,
    getMessagesByUserId,
    messages,
    isMessagesLoading,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();
  const { authUser }      = useAuthStore();
  const messageEndRef     = useRef(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    getMessagesByUserId(selectedUser._id);
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [selectedUser, getMessagesByUserId, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <>
      <ChatHeader />

      <div className="flex-1 px-8 overflow-y-auto py-8">
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="space-y-6">
            {messages.map((msg) => (
              <div
                key={msg._id}
                className={`chat ${msg.senderId === authUser._id ? "chat-end" : "chat-start"}`}
              >
                <div
                  className={`chat-bubble relative ${
                    msg.senderId === authUser._id
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-800 text-slate-200"
                  }`}
                >
                  {/* ── Image ─────────────────────────────────────────── */}
                  {msg.image && (
                    <img
                      src={msg.image}
                      alt="Shared"
                      className="rounded-lg h-48 object-cover cursor-zoom-in hover:brightness-90 transition-all"
                      onClick={() => setLightboxSrc(msg.image)}
                      title="Click to enlarge"
                    />
                  )}

                  {/* ── File attachment ───────────────────────────────── */}
                  {msg.file && (
                    <a
                      href={msg.file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50 hover:bg-slate-600/60 transition-colors group"
                    >
                      <FileIcon className="w-8 h-8 text-cyan-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{msg.file.name}</p>
                        <p className="text-xs opacity-60">{formatFileSize(msg.file.size)}</p>
                      </div>
                      <Download className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </a>
                  )}

                  {/* ── Text ──────────────────────────────────────────── */}
                  {msg.text && <p className="mt-2">{msg.text}</p>}

                  <p className="text-xs mt-1 opacity-75 flex items-center gap-1">
                    {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {/* scroll target */}
            <div ref={messageEndRef} />
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder name={selectedUser.fullname} />
        )}
      </div>

      <MessageInput />

      {/* ── Image Lightbox ───────────────────────────────────────────────── */}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}

export default ChatContainer;

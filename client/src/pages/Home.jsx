import React, { useState, useEffect, useMemo, useRef } from "react";
import io from "socket.io-client";
import {
  Send,
  Bot,
  User,
  MoreVertical,
  Search,
  Paperclip,
  Smile,
  CornerUpLeft,
  X,
  ThumbsUp,
  ChevronUp,
  ChevronDown,
  LogOut,
  Sun,
  Moon,
  Copy,
  Hash,
  MessageCircle,
  Users,
  ChevronRight,
  Sparkles,
  Shield,
} from "lucide-react";
import { client } from "../client";
import { inAppWallet } from "thirdweb/wallets";
import {
  ConnectButton,
  useActiveAccount,
  useActiveWallet,
  useDisconnect,
} from "thirdweb/react";
import { defineChain } from "thirdweb/chains";
import { useTheme } from "../contexts/themeContext";

const socket = io("http://localhost:3000", { autoConnect: false });
const GENERAL_CONVERSATION_ID = "general";
const EMPTY_TYPING_USERS = new Set();

const formatAddress = (address) => {
  if (!address || typeof address !== "string") return "Unknown";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const parseDmMembers = (roomId) => {
  if (!roomId || typeof roomId !== "string") return [];
  const parts = roomId.split(":");
  if (parts.length >= 3) {
    return [parts[1], parts[2]];
  }
  return [];
};

function Home() {
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState([
    {
      id: GENERAL_CONVERSATION_ID,
      type: "general",
      title: "General Chat",
      members: [],
    },
  ]);
  const [activeConversationId, setActiveConversationId] = useState(
    GENERAL_CONVERSATION_ID,
  );
  const [messagesByConversation, setMessagesByConversation] = useState({
    [GENERAL_CONVERSATION_ID]: [],
  });
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(1);
  const [replyingTo, setReplyingTo] = useState(null);
  const [typingUsersByConversation, setTypingUsersByConversation] = useState(
    {},
  );
  const [isTyping, setIsTyping] = useState(false);
  const [activeReactionMenu, setActiveReactionMenu] = useState(null);
  const [userAddress, setUserAddress] = useState("");
  const [userName, setUserName] = useState("");
  const [copiedAddress, setCopiedAddress] = useState("");
  const [dmTarget, setDmTarget] = useState("");
  const [dmError, setDmError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const typingTimeoutRef = useRef(null);
  const chatEndRef = useRef(null);
  const reactionMenuRef = useRef(null);
  const headerMenuRef = useRef(null);
  const { darkMode, toggleTheme } = useTheme();
  const activeMessages = useMemo(
    () => messagesByConversation[activeConversationId] || [],
    [messagesByConversation, activeConversationId],
  );
  const activeTypingUsers = useMemo(
    () => typingUsersByConversation[activeConversationId] || EMPTY_TYPING_USERS,
    [typingUsersByConversation, activeConversationId],
  );

  // ThirdWeb hooks
  const account = useActiveAccount();
  const { disconnect } = useDisconnect();
  const wallet = useActiveWallet();

  // Filter conversations based on search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter((conv) => {
      const meta = getConversationListMeta(conv);
      return (
        meta.title.toLowerCase().includes(query) ||
        meta.subtitle.toLowerCase().includes(query)
      );
    });
  }, [conversations, searchQuery]);

  // Update user info when account changes
  useEffect(() => {
    if (account) {
      const address = account.address;
      setUserAddress(address);
      setUserName(
        `${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
      );

      socket.auth = { userId: address };
      if (!socket.connected) {
        socket.connect();
      }

      const handleConnect = () => {
        socket.emit("user_joined", { userId: address, userName: userName });
      };

      socket.off("connect", handleConnect);
      socket.on("connect", handleConnect);
    } else {
      setUserAddress("");
      setUserName("");
      setConversations([
        {
          id: GENERAL_CONVERSATION_ID,
          type: "general",
          title: "General Chat",
          members: [],
        },
      ]);
      setActiveConversationId(GENERAL_CONVERSATION_ID);
      setMessagesByConversation({ [GENERAL_CONVERSATION_ID]: [] });
      setTypingUsersByConversation({});
      setDmTarget("");
      setDmError("");
      socket.disconnect();
    }
    return () => {
      socket.off("connect");
    };
  }, [account, userName]);

  // Close reaction menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        reactionMenuRef.current &&
        !reactionMenuRef.current.contains(event.target)
      ) {
        setActiveReactionMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function handleHeaderMenuClickOutside(event) {
      if (
        headerMenuRef.current &&
        !headerMenuRef.current.contains(event.target)
      ) {
        setShowHeaderMenu(false);
      }
    }
    document.addEventListener("mousedown", handleHeaderMenuClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleHeaderMenuClickOutside);
    };
  }, []);

  useEffect(() => {
    socket.on("receive_message", (data) => {
      const conversationId = data.conversationId || GENERAL_CONVERSATION_ID;
      const newMessage = {
        message: data.message,
        id: data.authorId || data.id || "Anonymous",
        self: data.authorId === userAddress,
        author: data.author || undefined,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        replyTo: data.replyTo || null,
        replyToMessage: data.replyToMessage || null,
        messageId: data.messageId || Date.now().toString(),
        likes: data.likes || [],
        upvotes: data.upvotes || 0,
        downvotes: data.downvotes || 0,
        userReaction: null,
        conversationId,
      };

      setMessagesByConversation((prev) => {
        const existing = prev[conversationId] || [];
        return {
          ...prev,
          [conversationId]: [...existing, newMessage],
        };
      });

      if (data.author === "AI Agent") {
        setIsAgentThinking(false);
      }

      if (conversationId.startsWith("dm:") && userAddress) {
        setConversations((prev) => {
          if (prev.some((conv) => conv.id === conversationId)) {
            return prev;
          }
          const members = parseDmMembers(conversationId);
          return [
            ...prev,
            {
              id: conversationId,
              type: "dm",
              title: "Direct Message",
              members,
            },
          ];
        });
      }
    });

    socket.on("agent_thinking", () => {
      setIsAgentThinking(true);
    });

    socket.on("user_count", (count) => {
      setOnlineUsers(count);
    });

    socket.on("user_typing", (data) => {
      const conversationId = data.conversationId || GENERAL_CONVERSATION_ID;
      if (data.userId !== userAddress) {
        setTypingUsersByConversation((prev) => {
          const currentSet = prev[conversationId]
            ? new Set(prev[conversationId])
            : new Set();
          if (data.isTyping) {
            currentSet.add(data.userId);
          } else {
            currentSet.delete(data.userId);
          }
          return {
            ...prev,
            [conversationId]: currentSet,
          };
        });
      }
    });

    socket.on("message_reacted", (data) => {
      const conversationId = data.conversationId || GENERAL_CONVERSATION_ID;
      setMessagesByConversation((prev) => {
        const existing = prev[conversationId] || [];
        return {
          ...prev,
          [conversationId]: existing.map((msg) => {
            if (msg.messageId === data.messageId) {
              return {
                ...msg,
                likes: data.likes || msg.likes,
                upvotes: data.upvotes || msg.upvotes,
                downvotes: data.downvotes || msg.downvotes,
              };
            }
            return msg;
          }),
        };
      });
    });

    socket.on("user_joined", (data) => {
      const newMessage = {
        message: `${data.userName} joined the chat`,
        id: "system",
        self: false,
        author: "System",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        messageId: Date.now().toString(),
        likes: [],
        upvotes: 0,
        downvotes: 0,
        isSystemMessage: true,
        conversationId: GENERAL_CONVERSATION_ID,
      };

      setMessagesByConversation((prev) => {
        const existing = prev[GENERAL_CONVERSATION_ID] || [];
        return {
          ...prev,
          [GENERAL_CONVERSATION_ID]: [...existing, newMessage],
        };
      });
    });

    socket.on("user_left", (data) => {
      const newMessage = {
        message: `${data.userName} left the chat`,
        id: "system",
        self: false,
        author: "System",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        messageId: Date.now().toString(),
        likes: [],
        upvotes: 0,
        downvotes: 0,
        isSystemMessage: true,
        conversationId: GENERAL_CONVERSATION_ID,
      };

      setMessagesByConversation((prev) => {
        const existing = prev[GENERAL_CONVERSATION_ID] || [];
        return {
          ...prev,
          [GENERAL_CONVERSATION_ID]: [...existing, newMessage],
        };
      });
    });

    socket.on("dm_ready", (data) => {
      const { roomId, members } = data || {};
      if (!roomId) return;

      setConversations((prev) => {
        if (prev.some((conv) => conv.id === roomId)) {
          return prev;
        }
        const dmMembers = members?.length ? members : parseDmMembers(roomId);
        return [
          ...prev,
          {
            id: roomId,
            type: "dm",
            title: "Direct Message",
            members: dmMembers,
          },
        ];
      });

      setMessagesByConversation((prev) => ({
        ...prev,
        [roomId]: prev[roomId] || [],
      }));

      setActiveConversationId(roomId);
      setDmTarget("");
      setDmError("");
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    });

    socket.on("dm_error", (data) => {
      setDmError(data?.message || "Unable to start a direct message.");
    });

    return () => {
      socket.off("receive_message");
      socket.off("agent_thinking");
      socket.off("user_count");
      socket.off("user_typing");
      socket.off("message_reacted");
      socket.off("user_joined");
      socket.off("user_left");
      socket.off("dm_ready");
      socket.off("dm_error");
    };
  }, [userAddress]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeMessages, activeTypingUsers]);

  // Handle typing indicators
  useEffect(() => {
    if (message.trim() && !isTyping && userAddress) {
      setIsTyping(true);
      socket.emit("typing", {
        isTyping: true,
        userId: userAddress,
        conversationId: activeConversationId,
      });
    } else if (!message.trim() && isTyping && userAddress) {
      setIsTyping(false);
      socket.emit("typing", {
        isTyping: false,
        userId: userAddress,
        conversationId: activeConversationId,
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping && userAddress) {
        setIsTyping(false);
        socket.emit("typing", {
          isTyping: false,
          userId: userAddress,
          conversationId: activeConversationId,
        });
      }
    }, 2000);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message, isTyping, userAddress, activeConversationId]);

  const wallets = [
    inAppWallet({
      auth: { options: ["discord", "passkey", "google", "github"] },
      metadata: {
        name: "Chat App",
        image: {
          src: "/public/vite.svg",
          width: 50,
          height: 50,
        },
      },
      executionMode: {
        mode: "EIP7702",
        sponsorGas: true,
      },
      smartAccount: {
        chain: defineChain(1020352220),
        sponsorGas: true,
      },
    }),
  ];

  useEffect(() => {
    setReplyingTo(null);
    setActiveReactionMenu(null);
    setIsTyping(false);
    setIsAgentThinking(false);
  }, [activeConversationId]);

  const handleReaction = (messageId, reactionType) => {
    if (!userAddress) return;

    const message = activeMessages.find((m) => m.messageId === messageId);
    if (!message) return;

    let updatedLikes = [...message.likes];
    let upvotes = message.upvotes || 0;
    let downvotes = message.downvotes || 0;

    if (reactionType === "like") {
      const userLikeIndex = updatedLikes.indexOf(userAddress);
      if (userLikeIndex > -1) {
        updatedLikes.splice(userLikeIndex, 1);
      } else {
        updatedLikes.push(userAddress);
      }
    } else if (reactionType === "upvote") {
      upvotes += 1;
    } else if (reactionType === "downvote") {
      downvotes += 1;
    }

    setMessagesByConversation((prev) => {
      const existing = prev[activeConversationId] || [];
      return {
        ...prev,
        [activeConversationId]: existing.map((msg) => {
          if (msg.messageId === messageId) {
            return {
              ...msg,
              likes: reactionType === "like" ? updatedLikes : msg.likes,
              upvotes: reactionType === "upvote" ? upvotes : msg.upvotes,
              downvotes:
                reactionType === "downvote" ? downvotes : msg.downvotes,
            };
          }
          return msg;
        }),
      };
    });

    socket.emit("react_to_message", {
      conversationId: activeConversationId,
      messageId,
      reactionType,
      userId: userAddress,
      likes: reactionType === "like" ? updatedLikes : undefined,
      upvotes: reactionType === "upvote" ? upvotes : undefined,
      downvotes: reactionType === "downvote" ? downvotes : undefined,
    });

    setActiveReactionMenu(null);
  };

  const sendMessage = () => {
    if (!message.trim() || !userAddress) return;

    const messageId = Date.now().toString();
    const newMessage = {
      message,
      id: userAddress,
      self: true,
      author: userName,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      replyTo: replyingTo ? replyingTo.id : null,
      replyToMessage: replyingTo ? replyingTo.message : null,
      messageId,
      likes: [],
      upvotes: 0,
      downvotes: 0,
      conversationId: activeConversationId,
    };

    setMessagesByConversation((prev) => {
      const existing = prev[activeConversationId] || [];
      return {
        ...prev,
        [activeConversationId]: [...existing, newMessage],
      };
    });

    if (
      activeConversationId === GENERAL_CONVERSATION_ID &&
      message.match(/@agent\b/i)
    ) {
      setIsAgentThinking(true);
    }

    socket.emit("send_message", {
      message,
      authorId: userAddress,
      author: userName,
      replyTo: replyingTo ? replyingTo.id : null,
      replyToMessage: replyingTo ? replyingTo.message : null,
      messageId,
      likes: [],
      upvotes: 0,
      downvotes: 0,
      conversationId: activeConversationId,
    });

    setMessage("");
    setReplyingTo(null);
    setIsTyping(false);

    socket.emit("typing", {
      isTyping: false,
      userId: userAddress,
      conversationId: activeConversationId,
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey && userAddress) {
      e.preventDefault();
      sendMessage();
    }
  };

  const ReplyPreview = ({ replyTo, onCancel }) => {
    if (!replyTo) return null;

    return (
      <div className="mb-3 px-4 py-3 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-slate-800/50 dark:to-slate-900/50 border-l-3 border-sky-400 rounded-xl flex items-start justify-between backdrop-blur-sm">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs font-medium text-sky-700 dark:text-sky-300 mb-1">
            <CornerUpLeft size={12} />
            Replying to {formatAddress(replyTo.id)}
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-200 line-clamp-2">
            "{replyTo.message}"
          </div>
        </div>
        <button
          className="ml-3 p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
          onClick={onCancel}
        >
          <X size={16} className="text-slate-500 dark:text-slate-400" />
        </button>
      </div>
    );
  };

  const ReactionMenu = ({ messageId, position }) => {
    if (!activeReactionMenu || activeReactionMenu !== messageId) return null;

    return (
      <div
        ref={reactionMenuRef}
        className="absolute bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl p-2 flex space-x-2 z-20 backdrop-blur-xl"
        style={{
          bottom: "100%",
          left: position === "right" ? "auto" : "0",
          right: position === "right" ? "0" : "auto",
        }}
      >
        <button
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 hover:scale-110"
          onClick={() => handleReaction(messageId, "like")}
          title="Like"
        >
          <ThumbsUp size={18} className="text-sky-500" />
        </button>
        <button
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 hover:scale-110"
          onClick={() => handleReaction(messageId, "upvote")}
          title="Upvote"
        >
          <ChevronUp size={18} className="text-emerald-500" />
        </button>
        <button
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 hover:scale-110"
          onClick={() => handleReaction(messageId, "downvote")}
          title="Downvote"
        >
          <ChevronDown size={18} className="text-rose-500" />
        </button>
      </div>
    );
  };

  const MessageBubble = ({ msg, idx }) => {
    const isAgent = msg.author === "AI Agent";
    const isSelf = msg.self;
    const isSystemMessage = msg.isSystemMessage;

    if (isSystemMessage) {
      return (
        <div className="flex justify-center mb-6">
          <div className="max-w-md px-5 py-3 bg-white/90 dark:bg-slate-900/90 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl backdrop-blur-xl shadow-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              {msg.message}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`flex mb-6 ${isSelf ? "justify-end" : "justify-start"}`}
        id={`message-${idx}`}
      >
        <div
          className={`max-w-[90%] lg:max-w-2xl ${
            isSelf ? "ml-auto" : "mr-auto"
          } relative`}
        >
          {msg.replyToMessage && (
            <div className="mb-2 px-4 py-2 bg-slate-100/80 dark:bg-slate-800/80 border-l-3 border-slate-300 dark:border-slate-700 rounded-xl">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Replying to{" "}
                <span className="text-slate-800 dark:text-slate-100">
                  {formatAddress(msg.replyTo)}
                </span>
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-200 line-clamp-2">
                "{msg.replyToMessage}"
              </div>
            </div>
          )}

          <div className="flex items-end gap-3">
            {!isSelf && !isAgent && (
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-2xl overflow-hidden border-2 border-white/80 dark:border-slate-900/80 shadow-sm">
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.id}`}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            <div className="flex-1">
              {!isSelf && !isAgent && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {msg.author}
                  </span>
                  <button
                    onClick={() => handleCopyAddress(msg.id)}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                    title="Copy address"
                  >
                    <Copy size={12} />
                  </button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    •
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {msg.timestamp}
                  </span>
                </div>
              )}

              <div
                className={`relative group rounded-2xl px-5 py-3 ${
                  isSelf
                    ? "bg-gradient-to-r from-sky-500 to-blue-500 text-white"
                    : isAgent
                      ? "bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 border border-slate-200/50 dark:border-slate-700/50"
                      : "bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700/50"
                } shadow-sm`}
              >
                <p
                  className={`text-sm leading-relaxed ${
                    isSelf ? "text-white" : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {msg.message}
                </p>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3">
                    {msg.likes && msg.likes.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400">
                        <ThumbsUp size={14} />
                        <span>{msg.likes.length}</span>
                      </div>
                    )}
                    {msg.upvotes > 0 && (
                      <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <ChevronUp size={14} />
                        <span>{msg.upvotes}</span>
                      </div>
                    )}
                    {msg.downvotes > 0 && (
                      <div className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
                        <ChevronDown size={14} />
                        <span>{msg.downvotes}</span>
                      </div>
                    )}
                  </div>

                  {!isAgent && userAddress && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors text-slate-600 dark:text-slate-200"
                        onClick={() =>
                          setReplyingTo({ id: msg.id, message: msg.message })
                        }
                        title="Reply"
                      >
                        <CornerUpLeft size={16} />
                      </button>
                      <button
                        className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors text-slate-600 dark:text-slate-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveReactionMenu(
                            activeReactionMenu === msg.messageId
                              ? null
                              : msg.messageId,
                          );
                        }}
                        title="React"
                      >
                        <ThumbsUp size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isAgent && (
                <div className="flex items-center gap-2 mt-2 ml-1">
                  <div className="p-1 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg">
                    <Bot
                      size={14}
                      className="text-purple-600 dark:text-purple-400"
                    />
                  </div>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    AI Agent
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-500">
                    •
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {msg.timestamp}
                  </span>
                </div>
              )}

              {isSelf && (
                <div className="flex items-center gap-2 mt-2 justify-end">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {msg.timestamp}
                  </span>
                </div>
              )}
            </div>

            {isSelf && (
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-2xl overflow-hidden border-2 border-white/80 dark:border-slate-900/80 shadow-sm bg-gradient-to-br from-sky-100 to-blue-100 dark:from-slate-800 dark:to-slate-900">
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userAddress}`}
                    alt="Your Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>

          {userAddress && (
            <ReactionMenu
              messageId={msg.messageId}
              position={isSelf ? "right" : "left"}
            />
          )}
        </div>
      </div>
    );
  };

  const TypingIndicator = () => {
    if (activeTypingUsers.size === 0) return null;

    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[90%] lg:max-w-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"></div>
              <div
                className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
                style={{ animationDelay: "0.1s" }}
              ></div>
              <div
                className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
                style={{ animationDelay: "0.2s" }}
              ></div>
            </div>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {activeTypingUsers.size === 1
                ? "Someone is typing..."
                : `${activeTypingUsers.size} people are typing...`}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const handleDisconnect = () => {
    try {
      disconnect(wallet);
      socket.emit("user_left", { userId: userAddress, userName });
      socket.disconnect();
      setUserAddress("");
      setUserName("");
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  };

  const handleStartDm = () => {
    if (!userAddress) {
      setDmError("Connect your wallet first.");
      return;
    }

    const target = dmTarget.trim();
    if (!target) {
      setDmError("Enter a wallet address.");
      return;
    }

    if (target === userAddress) {
      setDmError("You cannot DM yourself.");
      return;
    }

    setDmError("");

    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => {
        socket.emit("start_dm", { targetUserId: target });
      });
      return;
    }

    socket.emit("start_dm", { targetUserId: target });
  };

  const handleCopyAddress = async (address) => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(""), 1500);
    } catch (error) {
      console.error("Failed to copy address:", error);
    }
  };

  const getConversationTitle = (conversation) => {
    if (!conversation) return "Conversation";
    if (conversation.type === "general") return "General Chat";

    const members = conversation.members?.length
      ? conversation.members
      : parseDmMembers(conversation.id);
    const otherMember = members.find((member) => member !== userAddress);
    return otherMember
      ? `DM with ${formatAddress(otherMember)}`
      : "Direct Message";
  };

  const getConversationListMeta = (conversation) => {
    if (!conversation || conversation.type === "general") {
      return {
        title: "General Chat",
        subtitle: "Public room",
        avatarSeed: "general",
        icon: <Hash size={16} />,
        color: "text-blue-500",
      };
    }

    const members = conversation.members?.length
      ? conversation.members
      : parseDmMembers(conversation.id);
    const otherMember = members.find((member) => member !== userAddress);

    return {
      title: otherMember ? formatAddress(otherMember) : "Direct Message",
      subtitle: "Direct Message",
      avatarSeed: otherMember || conversation.id,
      icon: <MessageCircle size={16} />,
      color: "text-emerald-500",
    };
  };

  const isGeneralActive = activeConversationId === GENERAL_CONVERSATION_ID;
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-white via-slate-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 transition-colors duration-300">
      {!isSidebarOpen && (
        <button
          className="fixed top-4 left-4 z-50 p-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800/70 rounded-xl shadow-lg hover:bg-white dark:hover:bg-slate-900 transition-colors"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <Users size={20} className="text-slate-600 dark:text-slate-200" />
        </button>
      )}
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:static inset-y-0 left-0 z-50 w-80 md:w-96 lg:w-96 transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col bg-white/95 dark:bg-slate-900/95 border-r border-slate-200/50 dark:border-slate-800/50 backdrop-blur-xl">
          {/* Sidebar Header */}
          <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-sky-500 to-blue-500 rounded-xl">
                  <MessageCircle size={24} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                  Chatverse
                </h1>
              </div>
              <button
                className="p-2 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-xl transition-colors"
                onClick={() => setIsSidebarOpen(false)}
              >
                <ChevronRight
                  size={20}
                  className="text-slate-500 dark:text-slate-400"
                />
              </button>
            </div>

            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-3.5 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-12 pr-4 py-3 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Start Direct Message
                </h2>
                <Sparkles size={16} className="text-sky-500" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={dmTarget}
                  onChange={(e) => setDmTarget(e.target.value)}
                  placeholder="Enter wallet address"
                  className="flex-1 px-4 py-3 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
                <button
                  onClick={handleStartDm}
                  className="px-4 py-3 bg-gradient-to-r from-sky-500 to-blue-500 text-white font-medium rounded-xl hover:from-sky-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 transition-all duration-200"
                >
                  Start
                </button>
              </div>
              {dmError && (
                <div className="mt-2 text-sm text-rose-500 px-1">{dmError}</div>
              )}
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4">
              <div className="flex items-center gap-2 px-2 mb-3">
                <Users size={16} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Conversations ({filteredConversations.length})
                </span>
              </div>
              <div className="space-y-2">
                {filteredConversations.map((conversation) => {
                  const meta = getConversationListMeta(conversation);
                  const isActive = activeConversationId === conversation.id;

                  return (
                    <button
                      key={conversation.id}
                      onClick={() => {
                        setActiveConversationId(conversation.id);
                        if (
                          typeof window !== "undefined" &&
                          window.innerWidth < 768
                        ) {
                          setIsSidebarOpen(false);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${
                        isActive
                          ? "bg-gradient-to-r from-sky-500/10 to-blue-500/10 border border-sky-200/50 dark:border-sky-900/50"
                          : "hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            isActive
                              ? "bg-gradient-to-r from-sky-500 to-blue-500"
                              : "bg-slate-100 dark:bg-slate-800"
                          }`}
                        >
                          {meta.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div
                              className={`font-medium truncate ${
                                isActive
                                  ? "text-sky-700 dark:text-sky-300"
                                  : "text-slate-900 dark:text-slate-100"
                              }`}
                            >
                              {meta.title}
                            </div>
                          </div>
                          <div
                            className={`text-xs truncate ${
                              isActive
                                ? "text-sky-600/80 dark:text-sky-400/80"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {meta.subtitle}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* User Profile Section */}
          <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50">
            {userAddress ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white dark:border-slate-900 shadow-sm">
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userAddress}`}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-slate-900"></div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {userName}
                      </p>
                      <button
                        onClick={() => handleCopyAddress(userAddress)}
                        className="p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                        title="Copy address"
                      >
                        <Copy size={14} className="text-slate-400" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Connected
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="p-2 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-xl transition-colors"
                  title="Disconnect"
                >
                  <LogOut size={18} className="text-slate-400" />
                </button>
              </div>
            ) : (
              <div className="text-center">
                <ConnectButton
                  client={client}
                  wallets={wallets}
                  connectModal={{ size: "wide" }}
                  theme={darkMode ? "dark" : "light"}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/50 dark:border-slate-800/50 backdrop-blur-xl p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                className="p-2 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-xl transition-colors"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Users
                  size={20}
                  className="text-slate-500 dark:text-slate-400"
                />
              </button>
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-xl ${
                    isGeneralActive
                      ? "bg-gradient-to-r from-blue-500 to-indigo-500"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500"
                  }`}
                >
                  {isGeneralActive ? (
                    <Hash size={20} className="text-white" />
                  ) : (
                    <MessageCircle size={20} className="text-white" />
                  )}
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {getConversationTitle(activeConversation)}
                  </h1>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-slate-500 dark:text-slate-400">
                        {onlineUsers} online
                      </span>
                    </div>
                    {isGeneralActive && (
                      <div className="flex items-center gap-1 text-sky-500">
                        <Shield size={14} />
                        <span className="text-xs">Encrypted</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-xl transition-colors"
                aria-label="Toggle theme"
              >
                {darkMode ? (
                  <Sun size={20} className="text-amber-500" />
                ) : (
                  <Moon size={20} className="text-slate-500" />
                )}
              </button>
              <div ref={headerMenuRef} className="relative">
                <button
                  className="p-2.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-xl transition-colors"
                  onClick={() => setShowHeaderMenu((prev) => !prev)}
                  aria-label="Open menu"
                >
                  <MoreVertical
                    size={20}
                    className="text-slate-500 dark:text-slate-400"
                  />
                </button>
                {showHeaderMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-xl shadow-xl overflow-hidden z-50">
                    {userAddress ? (
                      <button
                        onClick={() => {
                          handleDisconnect();
                          setShowHeaderMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                        Connect wallet to see options.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gradient-to-b from-white/50 to-slate-50/50 dark:from-slate-900/50 dark:to-slate-900">
          {!userAddress ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="relative mb-8">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-sky-100 to-blue-100 dark:from-slate-800 dark:to-slate-900 border-2 border-white/80 dark:border-slate-800/80 shadow-xl flex items-center justify-center">
                  <User size={48} className="text-sky-500 dark:text-sky-400" />
                </div>
                <div className="absolute -top-2 -right-2 w-12 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                  <Bot size={24} className="text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
                Welcome to Chatverse
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-md mb-8">
                Connect your wallet to start secure, encrypted conversations
                with the community and AI assistant.
              </p>
              <ConnectButton
                client={client}
                wallets={wallets}
                connectModal={{ size: "wide" }}
                theme={darkMode ? "dark" : "light"}
              />
            </div>
          ) : activeMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="relative mb-8">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 border-2 border-white/80 dark:border-slate-800/80 shadow-xl flex items-center justify-center">
                  <MessageCircle size={48} className="text-slate-400" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <Sparkles size={24} className="text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
                {isGeneralActive
                  ? "Welcome to General Chat!"
                  : "Direct Message"}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-md">
                {isGeneralActive ? (
                  <>
                    Start chatting with the community. Type{" "}
                    <span className="font-medium text-sky-600 dark:text-sky-400">
                      @agent
                    </span>{" "}
                    to get AI assistance.
                  </>
                ) : (
                  "Send your first message to start the conversation."
                )}
              </p>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto">
              {activeMessages.map((msg, idx) => (
                <MessageBubble key={idx} msg={msg} idx={idx} />
              ))}
              <TypingIndicator />
              {isGeneralActive && isAgentThinking && (
                <div className="flex justify-start mb-6">
                  <div className="max-w-[90%] lg:max-w-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200/50 dark:border-purple-800/50 rounded-2xl px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                        <div
                          className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"
                          style={{ animationDelay: "0.4s" }}
                        ></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Bot size={16} className="text-purple-500" />
                        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                          AI Agent is thinking...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </main>

        {/* Input Area */}
        {userAddress && (
          <footer className="sticky bottom-0 z-30 bg-white/80 dark:bg-slate-900/80 border-t border-slate-200/50 dark:border-slate-800/50 backdrop-blur-xl p-4 lg:p-6">
            <div className="max-w-5xl mx-auto">
              <ReplyPreview
                replyTo={replyingTo}
                onCancel={() => setReplyingTo(null)}
              />

              <div className="flex items-end gap-3">
                <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-sm">
                  <div className="flex items-center px-4 py-3">
                    <button className="p-2 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors mr-2">
                      <Paperclip size={20} className="text-slate-400" />
                    </button>

                    <div className="flex-1">
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your message..."
                        className="w-full bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none focus:outline-none min-h-[44px] max-h-32"
                        rows="1"
                        disabled={!userAddress}
                      />
                    </div>

                    <button className="p-2 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors ml-2">
                      <Smile size={20} className="text-slate-400" />
                    </button>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-200/50 dark:border-slate-700/50">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Bot size={12} />
                          Type @agent for AI help
                        </span>
                      </div>
                      <div>{message.length}/500</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={sendMessage}
                  disabled={!message.trim() || !userAddress}
                  className="p-4 bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-2xl hover:from-sky-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

export default Home;

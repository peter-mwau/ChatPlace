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
  const typingTimeoutRef = useRef(null);
  const chatEndRef = useRef(null);
  const reactionMenuRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);
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

  // Update user info when account changes
  useEffect(() => {
    if (account) {
      const address = account.address;
      setUserAddress(address);
      // Use shortened address as display name
      setUserName(
        `${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
      );

      // Connect socket with user address as ID
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

    // socket.on("user_joined", (data) => {
    //   // You could show a notification when a user joins
    //   console.log(`${data.userName} joined the chat`);
    // });

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
      console.log(`${data.userName} left the chat`);
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

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set a timeout to stop showing typing after 2 seconds of inactivity
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
      <div className="mb-2 px-3 py-2 bg-sky-50/80 dark:bg-slate-800/60 border-l-4 border-sky-400/70 dark:border-sky-500/60 rounded flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs text-sky-700 dark:text-sky-300 font-medium mb-1">
            Replying to
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-200 truncate">
            "{replyTo.message}"
          </div>
        </div>
        <button
          className="ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      </div>
    );
  };

  const ReactionMenu = ({ messageId, position }) => {
    if (!activeReactionMenu || activeReactionMenu !== messageId) return null;

    return (
      <div
        ref={reactionMenuRef}
        className="absolute bg-white/90 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-700/60 shadow-xl rounded-xl p-2 flex space-x-2 z-10 backdrop-blur"
        style={{
          bottom: "100%",
          left: position === "right" ? "auto" : "0",
          right: position === "right" ? "0" : "auto",
        }}
      >
        <button
          className="p-1 rounded-full hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors"
          onClick={() => handleReaction(messageId, "like")}
          title="Like"
        >
          <ThumbsUp size={16} className="text-sky-500" />
        </button>
        <button
          className="p-1 rounded-full hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors"
          onClick={() => handleReaction(messageId, "upvote")}
          title="Upvote"
        >
          <ChevronUp size={16} className="text-emerald-500" />
        </button>
        <button
          className="p-1 rounded-full hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors"
          onClick={() => handleReaction(messageId, "downvote")}
          title="Downvote"
        >
          <ChevronDown size={16} className="text-rose-500" />
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
        <div className="flex justify-center mb-4">
          <div className="max-w-[85%] sm:max-w-md px-4 py-2 bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800/70 rounded-lg backdrop-blur">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic">
              {msg.message}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`flex mb-4 ${isSelf ? "justify-end" : "justify-start"}`}
        id={`message-${idx}`}
      >
        <div
          className={`max-w-[85%] sm:max-w-md ${
            isSelf ? "ml-auto" : "mr-auto"
          } relative`}
        >
          {msg.replyToMessage && (
            <div className="mb-1 px-3 py-2 bg-slate-100/70 dark:bg-slate-800/70 border-l-2 border-slate-300/70 dark:border-slate-700/70 rounded text-xs text-slate-600 dark:text-slate-300">
              <div className="font-medium">
                Replying to{" "}
                <span className="truncate w-[100px] bg-amber-200/80 dark:bg-amber-500/20 text-slate-900 dark:text-amber-200 p-1 rounded-b-3xl">
                  {msg.replyTo
                    ? `${msg.replyTo.slice(0, 6)}...${msg.replyTo.slice(-4)}`
                    : ""}
                </span>
              </div>
              <div className="truncate">"{msg.replyToMessage}"</div>
            </div>
          )}

          {!isSelf && !isAgent && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1 ml-1">
              <span>{msg.author}</span>
              <button
                onClick={() => handleCopyAddress(msg.id)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Copy address"
                type="button"
              >
                <Copy size={12} />
                {copiedAddress === msg.id ? "Copied" : "Copy"}
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {!isSelf && !isAgent && (
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-sm">
                {/* {msg.author && typeof msg.author === "string"
                  ? msg.author.charAt(0).toUpperCase()
                  : "U"} */}
                <img
                  src={`https://picsum.photos/seed/${msg.id || "default"}/300`}
                  alt="Profile"
                  className="w-full h-full object-cover rounded-full border-2 border-white/60 dark:border-slate-900/50"
                />
              </div>
            )}

            <div
              className={`px-4 py-2 rounded-2xl relative group ${
                isSelf
                  ? "bg-sky-600 dark:bg-sky-500 text-white rounded-br-md shadow-sm"
                  : isAgent
                    ? "bg-slate-100/80 dark:bg-slate-800/70 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/70 rounded-bl-md shadow-sm"
                    : "bg-white/90 dark:bg-slate-900/70 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/70 rounded-bl-md shadow-sm"
              }`}
            >
              <p className="text-sm">{msg.message}</p>

              {/* Reaction counts */}
              <div className="flex items-center mt-1 space-x-2 text-xs text-slate-500 dark:text-slate-300">
                {msg.likes && msg.likes.length > 0 && (
                  <div className="flex items-center">
                    <ThumbsUp size={12} className="text-sky-500 mr-1" />
                    <span>{msg.likes.length}</span>
                  </div>
                )}
                {msg.upvotes > 0 && (
                  <div className="flex items-center">
                    <ChevronUp size={12} className="text-emerald-500 mr-1" />
                    <span>{msg.upvotes}</span>
                  </div>
                )}
                {msg.downvotes > 0 && (
                  <div className="flex items-center">
                    <ChevronDown size={12} className="text-rose-500 mr-1" />
                    <span>{msg.downvotes}</span>
                  </div>
                )}
              </div>

              {/* Reply button - only show on hover for non-agent messages */}
              {!isAgent && userAddress && (
                <div className="absolute -right-10 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                  <button
                    className="p-1 bg-slate-200/80 dark:bg-slate-800/70 rounded-full hover:bg-slate-300/70 dark:hover:bg-slate-700/70"
                    onClick={() =>
                      setReplyingTo({ id: msg.id, message: msg.message })
                    }
                    title="Reply to this message"
                  >
                    <CornerUpLeft size={14} />
                  </button>
                  <button
                    className="p-1 bg-slate-200/80 dark:bg-slate-800/70 rounded-full hover:bg-slate-300/70 dark:hover:bg-slate-700/70"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveReactionMenu(
                        activeReactionMenu === msg.messageId
                          ? null
                          : msg.messageId,
                      );
                    }}
                    title="React to this message"
                  >
                    <ThumbsUp size={14} />
                  </button>
                </div>
              )}
            </div>

            {isSelf && (
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-sky-100 dark:bg-slate-800 text-sky-700 dark:text-slate-200 font-medium text-sm">
                {/* {userName && typeof userName === "string"
                  ? userName.charAt(0).toUpperCase()
                  : "Y"} */}
                <img
                  src={`https://picsum.photos/seed/${
                    userAddress || "default"
                  }/300`}
                  alt="Profile"
                  className="w-full h-full object-cover rounded-full border-2 border-white/60 dark:border-slate-900/50"
                />
              </div>
            )}
          </div>

          {isAgent && (
            <div className="flex items-center mt-1 ml-1">
              <Bot size={12} className="text-slate-400 mr-1" />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                AI Agent
              </span>
            </div>
          )}

          <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 ml-1 text-right">
            {msg.timestamp}
          </div>

          {/* Reaction menu */}
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
      <div className="flex justify-start mb-4">
        <div className="max-w-[85%] sm:max-w-md bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-700/70 rounded-2xl rounded-bl-md px-4 py-3 backdrop-blur">
          <div className="flex items-center">
            <div className="animate-pulse flex space-x-2">
              <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
              <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
              <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
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
      socket.disconnect(); // <-- Add this line
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
    };
  };

  const isGeneralActive = activeConversationId === GENERAL_CONVERSATION_ID;
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  return (
    <div className="flex min-h-[100svh] md:min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-sky-50 text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Sidebar */}
      <div className="w-full md:w-[320px] lg:w-1/4 bg-white/80 dark:bg-slate-900/70 border-r border-slate-200/70 dark:border-slate-800/70 backdrop-blur lg:flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-200/70 dark:border-slate-800/70">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Chat
            </h1>
            <button className="p-2 rounded-full hover:bg-slate-100/70 dark:hover:bg-slate-800/70">
              <MoreVertical
                size={18}
                className="text-slate-500 dark:text-slate-300"
              />
            </button>
          </div>

          <div className="relative mt-4">
            <Search
              size={18}
              className="absolute left-3 top-2.5 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2 bg-slate-100/70 dark:bg-slate-800/60 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white/90 dark:focus:bg-slate-800"
            />
          </div>

          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Start a DM
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={dmTarget}
                onChange={(e) => setDmTarget(e.target.value)}
                placeholder="Wallet address"
                className="flex-1 px-3 py-2 bg-slate-100/70 dark:bg-slate-800/60 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                onClick={handleStartDm}
                className="px-3 py-2 text-xs font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 dark:hover:bg-sky-500"
              >
                DM
              </button>
            </div>
            {dmError && (
              <div className="mt-2 text-xs text-rose-500">{dmError}</div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="px-2 py-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Conversations
            </div>
            {conversations.map((conversation) => {
              const meta = getConversationListMeta(conversation);
              const isActive = activeConversationId === conversation.id;

              return (
                <button
                  key={conversation.id}
                  onClick={() => setActiveConversationId(conversation.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-sky-600 text-white"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full overflow-hidden border-2 ${
                        isActive
                          ? "border-sky-200/60"
                          : "border-white/60 dark:border-slate-900/50"
                      }`}
                    >
                      <img
                        src={`https://picsum.photos/seed/${meta.avatarSeed}/120`}
                        alt="Conversation avatar"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{meta.title}</div>
                      <div
                        className={`text-xs truncate ${
                          isActive ? "text-white/80" : "text-slate-400"
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

        <div className="p-4 border-t border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
          {userAddress ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-slate-800 flex items-center justify-center text-sky-700 dark:text-slate-200 font-medium">
                  {/* {userName.charAt(0).toUpperCase()} */}
                  <img
                    src={`https://picsum.photos/seed/${
                      userAddress || "default"
                    }/300`}
                    alt="Profile"
                    className="w-full h-full object-cover rounded-full border-2 border-white/60 dark:border-slate-900/50"
                  />
                </div>
                <div className="ml-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {userName}
                    </p>
                    <button
                      onClick={() => handleCopyAddress(userAddress)}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Copy your address"
                      type="button"
                    >
                      <Copy size={12} />
                      {copiedAddress === userAddress ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Connected
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="p-2 text-slate-500 dark:text-slate-300 hover:cursor-pointer hover:text-rose-500 hover:bg-rose-500/10 rounded-full"
                title="Disconnect"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <ConnectButton
              client={client}
              wallets={wallets}
              connectModal={{ size: "wide" }}
            />
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="bg-white/80 dark:bg-slate-900/70 border-b border-slate-200/70 dark:border-slate-800/70 backdrop-blur p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center">
            <div className="mr-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            </div>
            <div>
              <h2 className="font-medium text-slate-900 dark:text-slate-100">
                {getConversationTitle(activeConversation)}
              </h2>
              {isGeneralActive ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {onlineUsers} online
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Direct Message
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-800/70 text-slate-500 dark:text-slate-300"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="p-2 rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-800/70 text-slate-500 dark:text-slate-300">
              <Search size={18} />
            </button>
            <div className="flex items-center relative">
              <button
                className="p-2 rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-800/70 text-slate-500 dark:text-slate-300 ml-1"
                onClick={() => setShowDropdown((prev) => !prev)}
              >
                <MoreVertical size={18} />
              </button>
              {showDropdown && (
                <div className="absolute right-0 top-10 bg-white/95 dark:bg-slate-900/95 border border-slate-200/70 dark:border-slate-700/70 shadow-xl rounded-lg py-2 z-20 min-w-[140px]">
                  {userAddress && (
                    <button
                      onClick={() => {
                        handleDisconnect();
                        setShowDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                    >
                      Disconnect
                    </button>
                  )}
                  {/* Add more dropdown items here if needed */}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/40 dark:bg-slate-900/20">
          {!userAddress ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-white/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-center mb-4">
                <User size={32} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">
                Connect your wallet to chat
              </h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mb-4">
                Please connect your wallet to start chatting with others and use
                the AI assistant.
              </p>
              <ConnectButton
                client={client}
                wallets={wallets}
                connectModal={{ size: "wide" }}
              />
            </div>
          ) : activeMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-white/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-center mb-4">
                <Bot size={32} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">
                {isGeneralActive ? "Welcome to the chat!" : "No messages yet"}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-md">
                {isGeneralActive ? (
                  <>
                    Start a conversation by typing a message below. Type{" "}
                    <span className="bg-slate-200/70 dark:bg-slate-800/70 px-1.5 py-0.5 rounded text-sm">
                      @agent
                    </span>{" "}
                    followed by your question to get help from the AI assistant.
                  </>
                ) : (
                  "Start the conversation by sending the first message."
                )}
              </p>
            </div>
          ) : (
            <div>
              {activeMessages.map((msg, idx) => (
                <MessageBubble key={idx} msg={msg} idx={idx} />
              ))}
              <TypingIndicator />
              {isGeneralActive && isAgentThinking && (
                <div className="flex justify-start mb-4">
                  <div className="max-w-[85%] sm:max-w-md bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-700/70 rounded-2xl rounded-bl-md px-4 py-3 backdrop-blur">
                    <div className="flex items-center">
                      <div className="animate-pulse flex space-x-2">
                        <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
                        <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
                        <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                        AI Agent is thinking...
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        {userAddress && (
          <div className="bg-white/80 dark:bg-slate-900/70 border-t border-slate-200/70 dark:border-slate-800/70 backdrop-blur p-4 sm:p-5">
            <ReplyPreview
              replyTo={replyingTo}
              onCancel={() => setReplyingTo(null)}
            />

            <div className="flex items-center">
              <button className="p-2 rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-800/70 text-slate-500 dark:text-slate-300 mr-1">
                <Paperclip size={20} />
              </button>

              <div className="flex-1 relative">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="w-full px-4 py-3 bg-slate-100/80 dark:bg-slate-800/60 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white/90 dark:focus:bg-slate-800 pr-12"
                  disabled={!userAddress}
                />

                <button className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <Smile size={20} />
                </button>
              </div>

              <button
                onClick={sendMessage}
                disabled={!message.trim() || !userAddress}
                className="ml-3 p-3 bg-sky-600 dark:bg-sky-500 text-white rounded-lg hover:bg-sky-700 dark:hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} />
              </button>
            </div>

            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex justify-between">
              <div>
                Type{" "}
                <span className="bg-slate-100/70 dark:bg-slate-800/70 px-1.5 py-0.5 rounded">
                  @agent
                </span>{" "}
                to ask the AI for help
              </div>
              <div>{message.length}/500</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;

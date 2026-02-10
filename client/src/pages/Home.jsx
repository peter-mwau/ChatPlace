import React, { useState, useEffect, useRef } from "react";
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

const socket = io.connect("http://localhost:3000");

function Home() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(1);
  const [replyingTo, setReplyingTo] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [activeReactionMenu, setActiveReactionMenu] = useState(null);
  const [userAddress, setUserAddress] = useState("");
  const [userName, setUserName] = useState("");
  const typingTimeoutRef = useRef(null);
  const chatEndRef = useRef(null);
  const reactionMenuRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const { darkMode, toggleTheme } = useTheme();

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
      socket.connect();

      // Emit user joined event
      socket.emit("user_joined", { userId: address, userName: userName });
    } else {
      setUserAddress("");
      setUserName("");
      socket.disconnect();
    }
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
      setChat((prev) => [
        ...prev,
        {
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
        },
      ]);
      if (data.author === "AI Agent") {
        setIsAgentThinking(false);
      }
    });

    socket.on("agent_thinking", () => {
      setIsAgentThinking(true);
    });

    socket.on("user_count", (count) => {
      setOnlineUsers(count);
    });

    socket.on("user_typing", (data) => {
      if (data.userId !== userAddress) {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          if (data.isTyping) {
            newSet.add(data.userId);
          } else {
            newSet.delete(data.userId);
          }
          return newSet;
        });
      }
    });

    socket.on("message_reacted", (data) => {
      setChat((prev) =>
        prev.map((msg) => {
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
      );
    });

    // socket.on("user_joined", (data) => {
    //   // You could show a notification when a user joins
    //   console.log(`${data.userName} joined the chat`);
    // });

    socket.on("user_joined", (data) => {
      // Show a centered system notification when a user joins
      setChat((prev) => [
        ...prev,
        {
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
          isSystemMessage: true, // Add this flag
        },
      ]);
    });

    socket.on("user_left", (data) => {
      // You could show a notification when a user leaves
      setChat((prev) => [
        ...prev,
        {
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
          isSystemMessage: true, // Add this flag
        },
      ]);
      console.log(`${data.userName} left the chat`);
    });

    return () => {
      socket.off("receive_message");
      socket.off("agent_thinking");
      socket.off("user_count");
      socket.off("user_typing");
      socket.off("message_reacted");
      socket.off("user_joined");
      socket.off("user_left");
    };
  }, [userAddress]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat, typingUsers]);

  // Handle typing indicators
  useEffect(() => {
    if (message.trim() && !isTyping && userAddress) {
      setIsTyping(true);
      socket.emit("typing", { isTyping: true, userId: userAddress });
    } else if (!message.trim() && isTyping && userAddress) {
      setIsTyping(false);
      socket.emit("typing", { isTyping: false, userId: userAddress });
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set a timeout to stop showing typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping && userAddress) {
        setIsTyping(false);
        socket.emit("typing", { isTyping: false, userId: userAddress });
      }
    }, 2000);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message, isTyping, userAddress]);

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

  const handleReaction = (messageId, reactionType) => {
    if (!userAddress) return;

    const message = chat.find((m) => m.messageId === messageId);
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

    setChat((prev) =>
      prev.map((msg) => {
        if (msg.messageId === messageId) {
          return {
            ...msg,
            likes: reactionType === "like" ? updatedLikes : msg.likes,
            upvotes: reactionType === "upvote" ? upvotes : msg.upvotes,
            downvotes: reactionType === "downvote" ? downvotes : msg.downvotes,
          };
        }
        return msg;
      }),
    );

    socket.emit("react_to_message", {
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
    };

    setChat((prev) => [...prev, newMessage]);

    if (message.match(/@agent\b/i)) {
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
    });

    setMessage("");
    setReplyingTo(null);

    setIsTyping(false);
    socket.emit("typing", { isTyping: false, userId: userAddress });
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
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 ml-1">
              {msg.author}
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
    if (typingUsers.size === 0) return null;

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
              {typingUsers.size === 1
                ? "Someone is typing..."
                : `${typingUsers.size} people are typing...`}
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
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Chat list would go here */}
          <div className="text-center text-slate-500 dark:text-slate-400 text-sm mt-4">
            Your conversations will appear here
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
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {userName}
                  </p>
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
                General Chat
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {onlineUsers} online
              </p>
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
          ) : chat.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-white/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-center mb-4">
                <Bot size={32} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">
                Welcome to the chat!
              </h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-md">
                Start a conversation by typing a message below. Type{" "}
                <span className="bg-slate-200/70 dark:bg-slate-800/70 px-1.5 py-0.5 rounded text-sm">
                  @agent
                </span>{" "}
                followed by your question to get help from the AI assistant.
              </p>
            </div>
          ) : (
            <div>
              {chat.map((msg, idx) => (
                <MessageBubble key={idx} msg={msg} idx={idx} />
              ))}
              <TypingIndicator />
              {isAgentThinking && (
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

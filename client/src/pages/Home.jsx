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
        `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
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
        })
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
      })
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
      <div className="mb-2 px-3 py-2 bg-blue-50 border-l-4 border-blue-400 rounded flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs text-blue-600 font-medium mb-1">
            Replying to
          </div>
          <div className="text-sm text-gray-700 truncate">
            "{replyTo.message}"
          </div>
        </div>
        <button
          className="ml-2 text-gray-500 hover:text-gray-700"
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
        className="absolute bg-white shadow-lg rounded-lg p-2 flex space-x-2 z-10"
        style={{
          bottom: "100%",
          left: position === "right" ? "auto" : "0",
          right: position === "right" ? "0" : "auto",
        }}
      >
        <button
          className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          onClick={() => handleReaction(messageId, "like")}
          title="Like"
        >
          <ThumbsUp size={16} className="text-blue-500" />
        </button>
        <button
          className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          onClick={() => handleReaction(messageId, "upvote")}
          title="Upvote"
        >
          <ChevronUp size={16} className="text-green-500" />
        </button>
        <button
          className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          onClick={() => handleReaction(messageId, "downvote")}
          title="Downvote"
        >
          <ChevronDown size={16} className="text-red-500" />
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
          <div className="max-w-xs lg:max-w-md px-4 py-2 bg-gray-100 rounded-lg">
            <p className="text-xs text-gray-500 text-center italic">
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
          className={`max-w-xs lg:max-w-md ${
            isSelf ? "ml-auto" : "mr-auto"
          } relative`}
        >
          {msg.replyToMessage && (
            <div className="mb-1 px-3 py-2 bg-gray-100 border-l-2 border-gray-300 rounded text-xs text-gray-600">
              <div className="font-medium">
                Replying to{" "}
                <span className="truncate w-[100px] bg-yellow-200/80 p-1 rounded-b-3xl">
                  {msg.replyTo
                    ? `${msg.replyTo.slice(0, 6)}...${msg.replyTo.slice(-4)}`
                    : ""}
                </span>
              </div>
              <div className="truncate">"{msg.replyToMessage}"</div>
            </div>
          )}

          {!isSelf && !isAgent && (
            <div className="text-xs text-gray-500 mb-1 ml-1">{msg.author}</div>
          )}

          <div className="flex items-end gap-2">
            {!isSelf && !isAgent && (
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-200 text-gray-700 font-medium text-sm">
                {/* {msg.author && typeof msg.author === "string"
                  ? msg.author.charAt(0).toUpperCase()
                  : "U"} */}
                <img
                  src={`https://picsum.photos/seed/${msg.id || "default"}/300`}
                  alt="Profile"
                  className="w-full h-full object-cover rounded-full border-2 border-white/50"
                />
              </div>
            )}

            <div
              className={`px-4 py-2 rounded-2xl relative group ${
                isSelf
                  ? "bg-blue-600 text-white rounded-br-md"
                  : isAgent
                  ? "bg-gray-100 text-gray-800 border border-gray-200 rounded-bl-md"
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-md"
              }`}
            >
              <p className="text-sm">{msg.message}</p>

              {/* Reaction counts */}
              <div className="flex items-center mt-1 space-x-2">
                {msg.likes && msg.likes.length > 0 && (
                  <div className="flex items-center text-xs">
                    <ThumbsUp size={12} className="text-blue-500 mr-1" />
                    <span>{msg.likes.length}</span>
                  </div>
                )}
                {msg.upvotes > 0 && (
                  <div className="flex items-center text-xs">
                    <ChevronUp size={12} className="text-green-500 mr-1" />
                    <span>{msg.upvotes}</span>
                  </div>
                )}
                {msg.downvotes > 0 && (
                  <div className="flex items-center text-xs">
                    <ChevronDown size={12} className="text-red-500 mr-1" />
                    <span>{msg.downvotes}</span>
                  </div>
                )}
              </div>

              {/* Reply button - only show on hover for non-agent messages */}
              {!isAgent && userAddress && (
                <div className="absolute -right-10 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                  <button
                    className="p-1 bg-gray-200 rounded-full hover:bg-gray-300"
                    onClick={() =>
                      setReplyingTo({ id: msg.id, message: msg.message })
                    }
                    title="Reply to this message"
                  >
                    <CornerUpLeft size={14} />
                  </button>
                  <button
                    className="p-1 bg-gray-200 rounded-full hover:bg-gray-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveReactionMenu(
                        activeReactionMenu === msg.messageId
                          ? null
                          : msg.messageId
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
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 font-medium text-sm">
                {/* {userName && typeof userName === "string"
                  ? userName.charAt(0).toUpperCase()
                  : "Y"} */}
                <img
                  src={`https://picsum.photos/seed/${
                    userAddress || "default"
                  }/300`}
                  alt="Profile"
                  className="w-full h-full object-cover rounded-full border-2 border-white/50"
                />
              </div>
            )}
          </div>

          {isAgent && (
            <div className="flex items-center mt-1 ml-1">
              <Bot size={12} className="text-gray-400 mr-1" />
              <span className="text-xs text-gray-500">AI Agent</span>
            </div>
          )}

          <div className="text-xs text-gray-400 mt-1 ml-1 text-right">
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
        <div className="max-w-xs lg:max-w-md bg-gray-100 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
          <div className="flex items-center">
            <div className="animate-pulse flex space-x-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            </div>
            <span className="text-xs text-gray-500 ml-2">
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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r border-gray-200 lg:flex flex-col hidden md:block">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-800">Chat</h1>
            <button className="p-2 rounded-full hover:bg-gray-100">
              <MoreVertical size={18} className="text-gray-500" />
            </button>
          </div>

          <div className="relative mt-4">
            <Search
              size={18}
              className="absolute left-3 top-2.5 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Chat list would go here */}
          <div className="text-center text-gray-500 text-sm mt-4">
            Your conversations will appear here
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          {userAddress ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium">
                  {/* {userName.charAt(0).toUpperCase()} */}
                  <img
                    src={`https://picsum.photos/seed/${
                      userAddress || "default"
                    }/300`}
                    alt="Profile"
                    className="w-full h-full object-cover rounded-full border-2 border-white/50"
                  />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-800">
                    {userName}
                  </p>
                  <p className="text-xs text-gray-500">Connected</p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="p-2 text-gray-500 hover:cursor-pointer hover:text-red-500 hover:bg-red-50 rounded-full"
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
        <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="mr-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            </div>
            <div>
              <h2 className="font-medium text-gray-800">General Chat</h2>
              <p className="text-xs text-gray-500">{onlineUsers} online</p>
            </div>
          </div>

          <div className="flex items-center">
            <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <Search size={18} />
            </button>
            <div className="flex items-center relative">
              <button
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 ml-1"
                onClick={() => setShowDropdown((prev) => !prev)}
              >
                <MoreVertical size={18} />
              </button>
              {showDropdown && (
                <div className="absolute right-0 top-10 bg-white shadow-lg rounded-lg py-2 z-20 min-w-[120px]">
                  {userAddress && (
                    <button
                      onClick={() => {
                        handleDisconnect();
                        setShowDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100"
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
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {!userAddress ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-4">
                <User size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Connect your wallet to chat
              </h3>
              <p className="text-gray-500 max-w-md mb-4">
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
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-4">
                <Bot size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Welcome to the chat!
              </h3>
              <p className="text-gray-500 max-w-md">
                Start a conversation by typing a message below. Type{" "}
                <span className="bg-gray-200 px-1.5 py-0.5 rounded text-sm">
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
                  <div className="max-w-xs lg:max-w-md bg-gray-100 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center">
                      <div className="animate-pulse flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      </div>
                      <span className="text-xs text-gray-500 ml-2">
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
          <div className="bg-white border-t border-gray-200 p-4">
            <ReplyPreview
              replyTo={replyingTo}
              onCancel={() => setReplyingTo(null)}
            />

            <div className="flex items-center">
              <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 mr-1">
                <Paperclip size={20} />
              </button>

              <div className="flex-1 relative">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="w-full px-4 py-3 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white pr-12"
                  disabled={!userAddress}
                />

                <button className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  <Smile size={20} />
                </button>
              </div>

              <button
                onClick={sendMessage}
                disabled={!message.trim() || !userAddress}
                className="ml-3 p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} />
              </button>
            </div>

            <div className="mt-2 text-xs text-gray-500 flex justify-between">
              <div>
                Type{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded">
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

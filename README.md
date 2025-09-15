# ChatPlace: Real-Time Chat with AI Agent

ChatPlace is a modern real-time chat application built with a Vite + React frontend and a Node.js + Express + Socket.IO backend. It features a unique AI Agent integration, allowing users to mention `@agent` in chat to receive intelligent responses from an external AI microservice (e.g., a FastAPI backend).

---

## Features

- Real-time chat between multiple users using Socket.IO
- Beautiful, modern chat UI with avatars, message bubbles, and effects
- Mention `@agent` in chat to trigger an AI Agent response
- Rate limiting for AI Agent requests to prevent spam
- Extensible architecture for future features (rooms, threads, etc.)

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/peter-mwau/chatplace.git
cd chatplace
```

### 2. Install Dependencies

Install both client and server dependencies:

```bash
cd server
npm install
cd ../client
npm install
```

### 3. Start the Servers

- **Start the backend:**
  ```bash
  cd ../server
  npm start
  ```
- **Start the frontend:**
  ```bash
  cd ../client
  npm run dev
  ```

### 4. (Optional) Start the AI Agent Microservice

- The AI Agent is a separate FastAPI service (not included here). See the `/server/server.js` comments for integration details.

---

## How It Works

- Users connect to the chat via the React frontend.
- Messages are sent and received in real-time using Socket.IO.
- If a message contains `@agent`, the backend triggers a webhook to the AI Agent microservice.
- The AI Agent processes the query and sends a response back to the backend, which broadcasts it to all users.
- Rate limiting ensures users can't spam the agent.

---

## Contributing

1. Fork this repository
2. Create a new branch: `git checkout -b feature/your-feature`
3. Make your changes and commit: `git commit -am 'Add new feature'`
4. Push to your fork: `git push origin feature/your-feature`
5. Open a Pull Request describing your changes

### Guidelines

- Use clear commit messages
- Keep code style consistent (see existing code)
- Add comments and documentation where helpful
- Test your changes before submitting

---

## Implementation Details

- **Frontend:** Vite + React, Tailwind CSS for styling, Socket.IO-client for real-time communication. See `client/src/pages/Home.jsx` for the main chat logic and UI.
- **Backend:** Node.js, Express, Socket.IO, Axios (for webhook calls). See `server/server.js` for all server logic, including agent integration and rate limiting.
- **AI Agent:** Expects a FastAPI service running at `http://localhost:8000/webhook` (configurable). The backend sends user queries to this service and receives responses via a secure callback endpoint.

---

## License

MIT

---

## Contact

For questions or suggestions, open an issue or contact the maintainer.

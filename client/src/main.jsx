import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import { ThirdwebProvider } from "thirdweb/react";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ThirdwebProvider>
        <App />
      </ThirdwebProvider>
    </BrowserRouter>
  </StrictMode>
);

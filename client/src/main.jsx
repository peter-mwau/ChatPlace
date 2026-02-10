import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import { ThirdwebProvider } from "thirdweb/react";
import { ThemeProvider } from "./contexts/themeContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ThirdwebProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ThirdwebProvider>
    </BrowserRouter>
  </StrictMode>,
);

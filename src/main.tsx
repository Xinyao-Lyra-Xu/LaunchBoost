import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Forward uncaught renderer errors to the main-process log file.
window.addEventListener("error", (e) => {
  window.api?.logError?.(`window.error: ${e.message}\n${e.error?.stack ?? ""}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  window.api?.logError?.(`unhandledrejection: ${reason?.stack ?? String(reason)}`);
});

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

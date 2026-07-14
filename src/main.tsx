import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { logClientEvent } from "./lib/commands";

const describeError = (value: unknown) => {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
  return String(value);
};

window.addEventListener("error", (event) => {
  logClientEvent(
    `window_error message=${event.message} source=${event.filename}:${event.lineno}:${event.colno} error=${describeError(event.error)}`,
  ).catch(() => undefined);
});

window.addEventListener("unhandledrejection", (event) => {
  logClientEvent(`unhandled_rejection reason=${describeError(event.reason)}`).catch(
    () => undefined,
  );
});

logClientEvent(`frontend_loaded hash=${window.location.hash}`).catch(() => undefined);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

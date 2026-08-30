import "./polyfill";

import React from "react";
import { createRoot } from "react-dom/client";
import { installNetworkTap } from "./lib/netlog";
import App from "./App";
import "./styles.css";

installNetworkTap();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

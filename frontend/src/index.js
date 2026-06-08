import React from "react";
import ReactDOM from "react-dom/client";
// Runtime-origin patch MUST be imported BEFORE the App component so the
// axios + fetch interceptors are installed before the first network
// request fires (e.g. the auth-context bootstrapping, the welcome page
// hero counter, etc.).  This guarantees that on a custom domain like
// bibicar.org the frontend talks to /api/* on the SAME origin instead
// of the Emergent default `*.emergent.host` URL that was baked at
// build time.  See /app/frontend/src/lib/runtime-origin-patch.js for
// the full rationale.
import "@/lib/runtime-origin-patch";
import "@/index.css";
import "@/styles/admin-i18n-adaptive.css";
import "@/components/reveal.global.css";
import "leaflet/dist/leaflet.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

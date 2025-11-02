import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/tailwind.css";
import { OptionsApp } from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Options root container missing");
}

createRoot(container).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);

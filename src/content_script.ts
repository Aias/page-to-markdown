import TurndownService from "turndown";
import * as TurndownPluginGfm from "turndown-plugin-gfm";

import { domainConfigs } from "./rules";

declare global {
  interface Window {
    convertPageToMarkdown?: () => void;
  }
}

window.convertPageToMarkdown = async function () {
  const currentDomain = window.location.hostname;

  let selector = "main";
  let removeSelectors: string[] = [];
  if (domainConfigs[currentDomain]) {
    selector = domainConfigs[currentDomain].selector;
    removeSelectors = domainConfigs[currentDomain].remove || [];
  }

  let mainEl = document.querySelector(selector);
  if (!mainEl) mainEl = document.body;

  // Remove unwanted elements
  removeSelectors.forEach((sel) => {
    mainEl?.querySelectorAll(sel).forEach((el) => el.remove());
  });

  const title = document.title || "";
  const url = document.location.href || "";
  const descriptionMeta = document.querySelector('meta[name="description"]');
  const description = descriptionMeta
    ? descriptionMeta.getAttribute("content") || ""
    : "";
  const authorMeta = document.querySelector('meta[name="author"]');
  const author = authorMeta ? authorMeta.getAttribute("content") || "" : "";
  const retrievalDate = new Date().toISOString();

  const headings = Array.from(mainEl.querySelectorAll("h1, h2, h3")).map(
    (h: Element) => {
      const level = h.tagName.toLowerCase();
      return {
        text: (h.textContent || "").trim(),
        level: level,
      };
    }
  );

  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Enable GitHub Flavored Markdown tables
  turndownService.use(TurndownPluginGfm.gfm);

  // Custom rule for code blocks
  turndownService.addRule("codeBlocks", {
    filter: (node) => {
      return node.nodeName === "PRE" && !!node.querySelector("code");
    },
    replacement: (_, node) => {
      const codeNode = node.querySelector("code");
      const langMatch = codeNode
        ?.getAttribute("class")
        ?.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : "";
      return `\n\`\`\`${lang}\n${codeNode?.textContent}\n\`\`\`\n`;
    },
  });

  const markdownContent = turndownService.turndown(mainEl.innerHTML);

  const toc = headings
    .map((h) => {
      const prefix = h.level === "h1" ? "" : h.level === "h2" ? "  " : "    ";
      return `${prefix}- ${h.text}`;
    })
    .join("\n");

  const frontMatter = `---
title: ${title}
url: ${url}
description: ${description}
author: ${author}
retrieved: ${retrievalDate}
headings:
${toc}
---

`;
  const finalOutput = frontMatter + markdownContent;

  try {
    await copyToClipboard(finalOutput);
    showSuccessOverlay();
  } catch (err) {
    console.error("Failed to copy markdown: ", err);
  }
};

function showSuccessOverlay() {
  const overlay = document.createElement("div");
  overlay.innerText = "Markdown copied.";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0.5em",
    right: "0.5em",
    padding: "0.5em 1em",
    backgroundColor: "#0e5a27",
    color: "#fff",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
    fontWeight: "500",
    borderRadius: "4px",
    zIndex: "999999",
  } as CSSStyleDeclaration);

  document.body.appendChild(overlay);

  setTimeout(() => {
    document.body.removeChild(overlay);
  }, 2000);
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    // Try the modern clipboard API first
    await navigator.clipboard.writeText(text);
    console.log("Copied to clipboard");
  } catch (err) {
    // Fallback to execCommand
    console.log("Fallback to execCommand");
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      // execCommand is deprecated but we're using it as a fallback.
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

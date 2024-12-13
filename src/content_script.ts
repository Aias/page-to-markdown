import TurndownService from "turndown";
import { domainConfigs } from "./domainConfig";

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
    await navigator.clipboard.writeText(finalOutput);
    showSuccessOverlay();
  } catch (err) {
    console.error("Failed to copy markdown: ", err);
  }
};

function showSuccessOverlay() {
  const overlay = document.createElement("div");
  overlay.innerText = "Markdown copied to clipboard!";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "1rem",
    right: "1rem",
    padding: "1rem",
    backgroundColor: "#4CAF50",
    color: "#fff",
    borderRadius: "4px",
    zIndex: "999999",
  } as CSSStyleDeclaration);

  document.body.appendChild(overlay);

  setTimeout(() => {
    document.body.removeChild(overlay);
  }, 2000);
}

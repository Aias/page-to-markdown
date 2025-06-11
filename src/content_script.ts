import TurndownService from "turndown";
import * as TurndownPluginGfm from "turndown-plugin-gfm";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";

import { domainConfigs, loadCustomConfigs } from "./rules";

declare global {
  interface Window {
    convertPageToMarkdown?: () => void;
  }
}

// Default selectors to remove
const DEFAULT_REMOVE_SELECTORS = [
  "script, style, noscript, iframe, svg",
  "header, footer, aside, nav",
  ".share, [aria-label*=share], [role=button][data-action*=share]",
  ".ads, [class*=ad-], [id*=ad-]",
  ".newsletter, .cookie, .banner, .modal",
  "[class*=popup], [class*=overlay]",
  ".comments, #comments",
  ".related, .recommended",
];

// Helper to slugify headings
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Get the main content element using Readability or fallback
function getMainElement(doc: Document): HTMLElement {
  // Try Mozilla Readability first
  const documentClone = doc.cloneNode(true) as Document;
  const article = new Readability(documentClone).parse();
  
  if (article?.content) {
    const el = document.createElement("div");
    el.innerHTML = DOMPurify.sanitize(article.content);
    return el;
  }
  
  // Fallback to custom selector or defaults
  const currentDomain = window.location.hostname;
  let selector = "main";
  
  if (domainConfigs[currentDomain]) {
    selector = domainConfigs[currentDomain].selector;
  }
  
  return (
    doc.querySelector(selector) as HTMLElement ||
    doc.querySelector("article, main") as HTMLElement ||
    doc.body
  );
}

// Remove cruft and clean up content
function cleanContent(el: HTMLElement, removeSelectors: string[]): void {
  // Remove all selectors
  const allRemoveSelectors = [...DEFAULT_REMOVE_SELECTORS, ...removeSelectors];
  allRemoveSelectors.forEach((sel) => {
    el.querySelectorAll(sel).forEach((node) => node.remove());
  });
  
  // Remove empty and hidden elements
  el.querySelectorAll("*").forEach((node) => {
    const element = node as HTMLElement;
    const style = getComputedStyle(element);
    
    // Remove if empty (no text and no images)
    if (!element.textContent?.trim() && element.querySelectorAll("img, svg").length === 0) {
      element.remove();
      return;
    }
    
    // Remove if hidden
    if (style.display === "none" || style.visibility === "hidden") {
      element.remove();
      return;
    }
  });
  
  // Process images
  el.querySelectorAll("img").forEach((img) => {
    // Skip tracker pixels
    if (img.width < 32 || img.height < 32) {
      img.remove();
      return;
    }
    
    // Convert relative URLs to absolute
    if (img.src) {
      try {
        img.src = new URL(img.src, location.href).href;
      } catch (e) {
        // Invalid URL, skip
      }
    }
  });
}

// Generate table of contents
function generateTOC(el: HTMLElement): string {
  return Array.from(el.querySelectorAll("h1,h2,h3,h4,h5,h6"))
    .map((h) => {
      const heading = h as HTMLElement;
      const depth = parseInt(heading.tagName[1]) - 1;
      const slug = heading.id || slugify(heading.textContent || "");
      
      // Ensure heading has ID for TOC links
      if (!heading.id) {
        heading.id = slug;
      }
      
      return `${"  ".repeat(depth)}- [${heading.textContent?.trim()}](#${slug})`;
    })
    .join("\n");
}

// Post-process markdown for LLM friendliness
function postProcessMarkdown(markdown: string): string {
  return markdown
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    // Replace smart quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Replace non-breaking spaces
    .replace(/\u00A0/g, " ")
    // Trim trailing whitespace from lines
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    // Ensure proper spacing around code blocks
    .replace(/```(\w*)\n/g, "\n```$1\n")
    .replace(/\n```/g, "\n```\n")
    // Trim final output
    .trim();
}

// Main conversion function
window.convertPageToMarkdown = async function () {
  try {
    // Load custom configs first
    await loadCustomConfigs();
    
    const currentDomain = window.location.hostname;
    const domainConfig = domainConfigs[currentDomain] || {};
    const removeSelectors = domainConfig.remove || [];
    
    // Get main content element
    const mainEl = getMainElement(document);
    
    // Clean content
    cleanContent(mainEl, removeSelectors);
    
    // Extract metadata
    const title = document.title || "";
    const url = document.location.href || "";
    const descriptionMeta = document.querySelector('meta[name="description"]');
    const description = descriptionMeta?.getAttribute("content") || "";
    const authorMeta = document.querySelector('meta[name="author"]');
    const author = authorMeta?.getAttribute("content") || "";
    const retrievalDate = new Date().toISOString();
    
    // Generate TOC before conversion
    const toc = generateTOC(mainEl);
    
    // Configure Turndown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "_",
      strongDelimiter: "**",
    });
    
    // Enable GFM with all features
    turndownService.use(TurndownPluginGfm.gfm);
    
    // Enhanced heading rule to preserve IDs
    turndownService.addRule("headingsWithIds", {
      filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
      replacement: (content, node) => {
        const hLevel = parseInt(node.nodeName.charAt(1));
        const hPrefix = "#".repeat(hLevel);
        const hContent = content.trim();
        const element = node as HTMLElement;
        
        // Add ID comment if present
        if (element.id) {
          return `\n\n${hPrefix} ${hContent} {#${element.id}}\n\n`;
        }
        return `\n\n${hPrefix} ${hContent}\n\n`;
      },
    });
    
    // Enhanced code blocks rule
    turndownService.addRule("enhancedCodeBlocks", {
      filter: (node) => {
        return node.nodeName === "PRE" && !!node.querySelector("code");
      },
      replacement: (_, node) => {
        const element = node as HTMLElement;
        const codeNode = element.querySelector("code");
        if (!codeNode) return "";
        
        const langMatch = codeNode.className?.match(/language-(\w+)/);
        const lang = langMatch ? langMatch[1] : "";
        const code = codeNode.textContent || "";
        
        // Wrap long lines
        const wrappedCode = code.split("\n").map(line => {
          if (line.length > 120) {
            // Simple wrapping for very long lines
            const chunks = [];
            for (let i = 0; i < line.length; i += 120) {
              chunks.push(line.slice(i, i + 120));
            }
            return chunks.join("\\\n");
          }
          return line;
        }).join("\n");
        
        return `\n\`\`\`${lang}\n${wrappedCode.trimEnd()}\n\`\`\`\n`;
      },
    });
    
    // Convert to markdown
    const rawHtml = mainEl.innerHTML;
    const sanitizedHtml = DOMPurify.sanitize(rawHtml);
    const markdownContent = turndownService.turndown(sanitizedHtml);
    const processedMarkdown = postProcessMarkdown(markdownContent);
    
    // Build front matter
    const frontMatter = `---
title: "${title.replace(/"/g, '\\"')}"
source: "${url}"
retrieved: "${retrievalDate}"
author: "${author.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
tags: []
toc: true
---`;
    
    // Combine all parts
    const finalOutput = [
      frontMatter,
      "",
      "## Table of Contents",
      "",
      toc,
      "",
      "---",
      "",
      processedMarkdown
    ].join("\n");
    
    // Copy to clipboard with promise handling
    const success = await copyToClipboard(finalOutput);
    if (success) {
      showNotification("Markdown copied to clipboard!", "success");
    } else {
      showNotification("Failed to copy. Check console for details.", "error");
      console.error("Markdown output:", finalOutput);
    }
  } catch (err) {
    console.error("Failed to convert page to markdown:", err);
    showNotification("Error converting page. Check console.", "error");
  }
};

// Enhanced notification system
function showNotification(message: string, type: "success" | "error" = "success") {
  const overlay = document.createElement("div");
  overlay.innerText = message;
  Object.assign(overlay.style, {
    position: "fixed",
    top: "1em",
    right: "1em",
    padding: "0.75em 1.5em",
    backgroundColor: type === "success" ? "#0e5a27" : "#d32f2f",
    color: "#fff",
    fontSize: "14px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontWeight: "500",
    borderRadius: "6px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    zIndex: "999999",
    cursor: "pointer",
  } as CSSStyleDeclaration);
  
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
  
  setTimeout(() => {
    if (document.body.contains(overlay)) {
      overlay.remove();
    }
  }, 3000);
}

// Enhanced clipboard function with promise
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Try modern clipboard API
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback to execCommand
    console.log("Falling back to execCommand for clipboard");
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      const success = document.execCommand("copy");
      return success;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// Add context menu support
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "convertToMarkdown") {
    window.convertPageToMarkdown?.();
    sendResponse({ success: true });
  }
  return true;
});
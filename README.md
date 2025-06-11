# Page to Markdown LLM Converter

A Chrome extension that converts web pages to clean, LLM-friendly Markdown with advanced content extraction and formatting.

## Features

- **Smart Content Extraction**: Uses Mozilla Readability to automatically identify and extract the main article content
- **Comprehensive Noise Removal**: Strips ads, navigation, comments, popups, and other irrelevant elements
- **Enhanced Markdown Output**:
  - YAML front matter with metadata (title, URL, author, date)
  - Auto-generated table of contents with heading anchors
  - GitHub Flavored Markdown support (tables, strikethrough, task lists)
  - Code blocks with syntax highlighting
  - Smart quote and whitespace normalization
- **Multiple Access Methods**:
  - Extension icon click
  - Right-click context menu
  - Keyboard shortcut (Cmd+Shift+M on Mac, Ctrl+Shift+M on Windows/Linux)
- **Customizable Domain Rules**: Configure content selectors per website via the options page

## Installation

1. Clone this repository
2. Install dependencies: `pnpm install`
3. Build the extension: `pnpm build`
4. Load the `dist` folder as an unpacked extension in Chrome

## Usage

1. Navigate to any web page
2. Click the extension icon, use the keyboard shortcut, or right-click and select "Copy page as Markdown"
3. The cleaned Markdown is automatically copied to your clipboard
4. Paste directly into your LLM prompt or Markdown editor

## Custom Domain Configuration

Access the extension options to add custom rules for specific websites:

1. Right-click the extension icon and select "Options"
2. Add domain-specific CSS selectors for content extraction
3. Specify elements to remove (e.g., `.ads`, `#comments`)

## Output Format

```markdown
---
title: "Article Title"
source: "https://example.com/article"
retrieved: "2024-01-01T12:00:00Z"
author: "Author Name"
description: "Article description"
tags: []
toc: true
---

## Table of Contents

- [Introduction](#introduction)
  - [Subsection](#subsection)
- [Main Content](#main-content)

---

# Introduction

Article content starts here...
```

## Development

- `pnpm dev` - Start development server
- `pnpm build` - Build for production

## Technologies

- TypeScript
- Mozilla Readability for content extraction
- Turndown for HTML to Markdown conversion
- DOMPurify for HTML sanitization
- Chrome Extension Manifest V3
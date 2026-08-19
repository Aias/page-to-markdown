import { describe, expect, it } from 'vitest';

import {
	buildFrontMatter,
	buildOutput,
	chooseBestSrcFromSrcset,
	cleanContent,
	convertToMarkdown,
	describeEmbeddedMedia,
	describeSVGs,
	escapeInfoString,
	escapeYaml,
	extractLanguage,
	extractMainContent,
	firstNonEmpty,
	generateTOC,
	normalizeLinks,
	postProcessMarkdown,
	slugify,
	stripFrontMatter,
	trimFencePadding,
	unwrapHeadingLinks,
} from './convert';
import type { DomainConfig } from './rules';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function html(inner: string): HTMLElement {
	const el = document.createElement('div');
	el.innerHTML = inner;
	return el;
}

// ---------------------------------------------------------------------------
// Pure string functions
// ---------------------------------------------------------------------------

describe('slugify', () => {
	it('lowercases and hyphenates', () => {
		expect(slugify('Hello World')).toBe('hello-world');
	});

	it('strips special characters', () => {
		expect(slugify('What is C++?')).toBe('what-is-c');
	});

	it('collapses hyphens and underscores', () => {
		expect(slugify('foo__bar--baz')).toBe('foo-bar-baz');
	});

	it('trims leading/trailing hyphens', () => {
		expect(slugify('---hello---')).toBe('hello');
	});

	it('handles empty input', () => {
		expect(slugify('')).toBe('');
	});

	it('preserves non-ASCII letters', () => {
		expect(slugify('Übersicht der Größe')).toBe('übersicht-der-größe');
		expect(slugify('日本語')).toBe('日本語');
	});
});

describe('chooseBestSrcFromSrcset', () => {
	it('picks the widest w descriptor', () => {
		expect(chooseBestSrcFromSrcset('small.jpg 320w, large.jpg 1024w')).toBe('large.jpg');
	});

	it('picks the highest x descriptor', () => {
		expect(chooseBestSrcFromSrcset('normal.jpg 1x, retina.jpg 2x')).toBe('retina.jpg');
	});

	it('returns the only candidate without descriptor', () => {
		expect(chooseBestSrcFromSrcset('only.jpg')).toBe('only.jpg');
	});

	it('returns null for empty string', () => {
		expect(chooseBestSrcFromSrcset('')).toBeNull();
	});

	it('keeps commas that belong to the URL', () => {
		expect(
			chooseBestSrcFromSrcset(
				'https://cdn.io/w_400,c_fill/a.jpg 400w, https://cdn.io/w_1200,c_fill/a.jpg 1200w'
			)
		).toBe('https://cdn.io/w_1200,c_fill/a.jpg');
	});

	it('parses comma-containing URLs without descriptors', () => {
		expect(chooseBestSrcFromSrcset('https://cdn.io/w_400,c_fill/a.jpg')).toBe(
			'https://cdn.io/w_400,c_fill/a.jpg'
		);
	});
});

describe('firstNonEmpty', () => {
	it('returns first non-empty string', () => {
		expect(firstNonEmpty([null, '', '  ', 'hello', 'world'])).toBe('hello');
	});

	it('returns null when all empty', () => {
		expect(firstNonEmpty([null, undefined, '', '  '])).toBeNull();
	});

	it('trims whitespace from result', () => {
		expect(firstNonEmpty(['  trimmed  '])).toBe('trimmed');
	});
});

describe('escapeYaml', () => {
	it('escapes double quotes', () => {
		expect(escapeYaml('say "hello"')).toBe('say \\"hello\\"');
	});

	it('escapes backslashes', () => {
		expect(escapeYaml('path\\to')).toBe('path\\\\to');
	});

	it('escapes newlines and tabs', () => {
		expect(escapeYaml('line1\nline2\ttab')).toBe('line1\\nline2\\ttab');
	});

	it('escapes carriage returns', () => {
		expect(escapeYaml('a\rb')).toBe('a\\rb');
	});
});

describe('escapeInfoString', () => {
	it('escapes double quotes', () => {
		expect(escapeInfoString('title="hello"')).toBe('title=\\"hello\\"');
	});
});

describe('postProcessMarkdown', () => {
	it('collapses multiple blank lines', () => {
		expect(postProcessMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
	});

	it('replaces smart quotes', () => {
		expect(postProcessMarkdown('\u201CHello\u201D \u2018world\u2019')).toBe('"Hello" \'world\'');
	});

	it('replaces non-breaking spaces', () => {
		expect(postProcessMarkdown('hello\u00A0world')).toBe('hello world');
	});

	it('trims trailing whitespace from lines', () => {
		expect(postProcessMarkdown('hello   \nworld   ')).toBe('hello\nworld');
	});
});

describe('stripFrontMatter', () => {
	it('extracts front matter and content', () => {
		const input = '---\ntitle: Hello\n---\nBody text';
		const result = stripFrontMatter(input);
		expect(result.frontMatter).toBe('---\ntitle: Hello\n---');
		expect(result.content).toBe('Body text');
	});

	it('returns null front matter when missing', () => {
		const result = stripFrontMatter('Just content');
		expect(result.frontMatter).toBeNull();
		expect(result.content).toBe('Just content');
	});

	it('returns null front matter for unclosed delimiters', () => {
		const result = stripFrontMatter('---\ntitle: Hello\nNo closing');
		expect(result.frontMatter).toBeNull();
	});
});

describe('trimFencePadding', () => {
	it('trims leading and trailing blank lines', () => {
		expect(trimFencePadding('\n\ncode here\n\n')).toBe('code here');
	});

	it('preserves inner blank lines', () => {
		expect(trimFencePadding('\na\n\nb\n')).toBe('a\n\nb');
	});

	it('normalizes CRLF', () => {
		expect(trimFencePadding('\r\ncode\r\n')).toBe('code');
	});
});

// ---------------------------------------------------------------------------
// DOM manipulation functions
// ---------------------------------------------------------------------------

describe('cleanContent', () => {
	it('removes default selectors', () => {
		const el = html('<main><p>keep</p><nav>remove</nav><footer>remove</footer></main>');
		cleanContent(el, []);
		expect(el.querySelector('nav')).toBeNull();
		expect(el.querySelector('footer')).toBeNull();
		expect(el.textContent).toContain('keep');
	});

	it('removes custom selectors', () => {
		const el = html('<p>keep</p><div class="custom-junk">remove</div>');
		cleanContent(el, ['.custom-junk']);
		expect(el.querySelector('.custom-junk')).toBeNull();
	});

	it('removes hidden elements', () => {
		const el = html('<p>visible</p><p hidden>hidden</p><p aria-hidden="true">aria</p>');
		cleanContent(el, []);
		expect(el.textContent).toBe('visible');
	});

	it('removes empty elements but keeps those with media', () => {
		const el = html('<div><p>  </p><div><img src="keep.jpg"></div></div>');
		cleanContent(el, []);
		expect(el.querySelector('img')).not.toBeNull();
	});

	it('removes tiny tracking images', () => {
		const el = html('<div><p>text</p><img src="pixel.gif" width="1" height="1"></div>');
		cleanContent(el, []);
		expect(el.querySelector('img')).toBeNull();
	});

	it('keeps whitespace-only spans inside code blocks', () => {
		const el = html(
			'<pre><code><span class="line"><span>    </span><span>indented</span></span>' +
				'<span class="line"></span></code></pre>'
		);
		cleanContent(el, []);
		expect(el.querySelectorAll('span')).toHaveLength(4);
	});

	it('keeps structural elements that carry no text', () => {
		const el = html('<p>a<br>b</p><hr><table><tr><td>1</td><td></td></tr></table>');
		cleanContent(el, []);
		expect(el.querySelector('br')).not.toBeNull();
		expect(el.querySelector('hr')).not.toBeNull();
		expect(el.querySelectorAll('td')).toHaveLength(2);
	});

	it('does not treat "ad-" as a substring of ordinary class names', () => {
		const el = html('<div class="read-more">keep</div><div class="ad-slot">drop</div>');
		cleanContent(el, []);
		expect(el.querySelector('.read-more')).not.toBeNull();
		expect(el.querySelector('.ad-slot')).toBeNull();
	});
});

describe('normalizeLinks', () => {
	it('strips UTM parameters', () => {
		const el = html('<a href="https://example.com/page?utm_source=twitter&keep=1">link</a>');
		normalizeLinks(el);
		const href = el.querySelector('a')?.getAttribute('href') || '';
		expect(href).toContain('keep=1');
		expect(href).not.toContain('utm_source');
	});

	it('strips common tracking parameters', () => {
		const el = html('<a href="https://example.com/?fbclid=abc&gclid=def">link</a>');
		normalizeLinks(el);
		const href = el.querySelector('a')?.getAttribute('href') || '';
		expect(href).not.toContain('fbclid');
		expect(href).not.toContain('gclid');
	});

	it('preserves hash-only anchors', () => {
		const el = html('<a href="#section">link</a>');
		normalizeLinks(el);
		expect(el.querySelector('a')?.getAttribute('href')).toBe('#section');
	});

	it('ignores javascript: hrefs', () => {
		const el = html('<a href="javascript:void(0)">link</a>');
		normalizeLinks(el);
		expect(el.querySelector('a')?.getAttribute('href')).toBe('javascript:void(0)');
	});

	it('keeps ref, which sites use to address content rather than track', () => {
		const el = html('<a href="https://example.com/blob/x.ts?ref=main">link</a>');
		normalizeLinks(el);
		expect(el.querySelector('a')?.getAttribute('href')).toContain('ref=main');
	});
});

describe('unwrapHeadingLinks', () => {
	it('unwraps a heading that is a single link', () => {
		const el = html('<h2><a href="/page">Heading Text</a></h2>');
		unwrapHeadingLinks(el);
		const h2 = el.querySelector('h2');
		expect(h2?.querySelector('a')).toBeNull();
		expect(h2?.textContent).toBe('Heading Text');
	});

	it('leaves headings with multiple children alone', () => {
		const el = html('<h2><a href="/page">Link</a> <span>extra</span></h2>');
		unwrapHeadingLinks(el);
		expect(el.querySelector('h2 a')).not.toBeNull();
	});

	it('leaves headings with text outside the link alone', () => {
		const el = html('<h2><a href="/page">Title</a> and more</h2>');
		unwrapHeadingLinks(el);
		expect(el.querySelector('h2')?.textContent).toBe('Title and more');
	});
});

describe('describeSVGs', () => {
	it('removes small icon SVGs', () => {
		const el = html('<svg width="16" height="16"><path d="M0 0"/></svg>');
		describeSVGs(el);
		expect(el.querySelector('svg')).toBeNull();
		expect(el.querySelector('p')).toBeNull();
	});

	it('replaces titled SVGs with description', () => {
		const el = html('<svg width="200" height="100"><title>Architecture diagram</title></svg>');
		describeSVGs(el);
		expect(el.querySelector('svg')).toBeNull();
		expect(el.textContent).toContain('[SVG: Architecture diagram]');
	});

	it('uses aria-label for description', () => {
		const el = html('<svg width="200" height="100" aria-label="Flow chart"></svg>');
		describeSVGs(el);
		expect(el.textContent).toContain('[SVG: Flow chart]');
	});

	it('falls back to [SVG diagram] for large undescribed SVGs', () => {
		const el = html('<svg width="500" height="300"></svg>');
		describeSVGs(el);
		expect(el.textContent).toContain('[SVG diagram]');
	});
});

describe('describeEmbeddedMedia', () => {
	it('replaces iframe with description', () => {
		const el = html('<iframe src="https://www.youtube.com/embed/abc" title="My Video"></iframe>');
		describeEmbeddedMedia(el);
		expect(el.querySelector('iframe')).toBeNull();
		const text = el.textContent || '';
		expect(text).toContain('Embedded iframe');
		expect(text).toContain('youtube.com');
		expect(text).toContain('My Video');
	});
});

describe('generateTOC', () => {
	it('builds TOC from headings', () => {
		const el = html('<h1>Title</h1><h2>Section</h2><h3>Subsection</h3>');
		const toc = generateTOC(el);
		expect(toc).toContain('- [Title](#title)');
		expect(toc).toContain('  - [Section](#section)');
		expect(toc).toContain('    - [Subsection](#subsection)');
	});

	it('deduplicates slugs', () => {
		const el = html('<h2>Intro</h2><h2>Intro</h2><h2>Intro</h2>');
		const toc = generateTOC(el);
		expect(toc).toContain('#intro)');
		expect(toc).toContain('#intro-1)');
		expect(toc).toContain('#intro-2)');
	});

	it('uses existing heading IDs', () => {
		const el = html('<h2 id="custom-id">My Heading</h2>');
		const toc = generateTOC(el);
		expect(toc).toContain('#custom-id)');
	});

	it('escapes brackets in heading text', () => {
		const el = html('<h2>Using [brackets] here</h2>');
		expect(generateTOC(el)).toContain('- [Using \\[brackets\\] here](#using-brackets-here)');
	});

	it('falls back to a slug when heading text yields none', () => {
		const el = html('<h2>🎉</h2>');
		expect(generateTOC(el)).toContain('(#section)');
	});
});

describe('extractLanguage', () => {
	it('reads data-language attribute', () => {
		const pre = document.createElement('pre');
		pre.dataset.language = 'typescript';
		expect(extractLanguage(pre, null, null)).toBe('typescript');
	});

	it('reads language- class prefix', () => {
		const pre = document.createElement('pre');
		const code = document.createElement('code');
		code.className = 'language-python';
		expect(extractLanguage(pre, code, null)).toBe('python');
	});

	it('returns null when no language found', () => {
		const pre = document.createElement('pre');
		expect(extractLanguage(pre, null, null)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// High-level pipeline
// ---------------------------------------------------------------------------

describe('extractMainContent', () => {
	const body = `
		<div id="custom"><p>Configured region content.</p></div>
		<article><h1>Readable</h1>${'<p>A long readable article body for extraction to latch onto.</p>'.repeat(10)}</article>
	`;

	function docWithBody(): Document {
		const doc = document.implementation.createHTMLDocument('Test');
		doc.body.innerHTML = body;
		return doc;
	}

	it('prefers a configured selector over automatic extraction', () => {
		const configs: Record<string, DomainConfig> = { 'example.com': { selector: '#custom' } };
		const { element } = extractMainContent(docWithBody(), 'example.com', configs);
		expect(element.textContent).toContain('Configured region content.');
		expect(element.textContent).not.toContain('Readable');
	});

	it('matches a bare-hostname rule from a www. page', () => {
		const configs: Record<string, DomainConfig> = { 'example.com': { selector: '#custom' } };
		const { element } = extractMainContent(docWithBody(), 'www.example.com', configs);
		expect(element.textContent).toContain('Configured region content.');
	});

	it('matches a www. rule from a bare-hostname page', () => {
		const configs: Record<string, DomainConfig> = { 'www.example.com': { selector: '#custom' } };
		const { element } = extractMainContent(docWithBody(), 'example.com', configs);
		expect(element.textContent).toContain('Configured region content.');
	});

	it('falls back to extraction when the configured selector matches nothing', () => {
		const configs: Record<string, DomainConfig> = { 'example.com': { selector: '#missing' } };
		const { element } = extractMainContent(docWithBody(), 'example.com', configs);
		expect(element.textContent).toContain('Readable');
	});

	it('surfaces author and description metadata from extraction', () => {
		const doc = document.implementation.createHTMLDocument('Test');
		doc.head.innerHTML = `
			<meta name="author" content="Jane Writer" />
			<meta name="description" content="A page about extraction." />
		`;
		doc.body.innerHTML = body;
		const { author, description } = extractMainContent(doc, 'example.org', {});
		expect(author).toBe('Jane Writer');
		expect(description).toBe('A page about extraction.');
	});
});

describe('buildFrontMatter', () => {
	it('produces valid YAML front matter', () => {
		const fm = buildFrontMatter({
			title: 'Test "Title"',
			source: 'https://example.com',
			author: 'Jane',
			description: 'A test page',
			retrieved: '2025-01-01T00:00:00.000Z',
		});
		expect(fm).toContain('---');
		expect(fm).toContain('title: "Test \\"Title\\""');
		expect(fm).toContain('source: "https://example.com"');
		expect(fm).toContain('author: "Jane"');
	});

	it('escapes the source URL', () => {
		const fm = buildFrontMatter({
			title: 'T',
			source: 'https://example.com/a"b',
			author: '',
			description: '',
			retrieved: '2025-01-01T00:00:00.000Z',
		});
		expect(fm).toContain('source: "https://example.com/a\\"b"');
	});
});

describe('buildOutput', () => {
	it('assembles front matter, TOC, and content', () => {
		const output = buildOutput('---\ntitle: "T"\n---', '- [A](#a)', 'Body');
		expect(output).toContain('## Table of Contents');
		expect(output).toContain('- [A](#a)');
		expect(output).toContain('Body');
	});

	it('omits table of contents block when toc is empty', () => {
		const output = buildOutput('---\ntitle: "T"\n---', '', 'Body');
		expect(output).not.toContain('## Table of Contents');
		expect(output).toContain('\n---\n\nBody');
	});
});

describe('convertToMarkdown', () => {
	it('converts simple HTML to Markdown', () => {
		const el = html('<h2>Hello</h2><p>World</p>');
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toContain('## Hello');
		expect(result.markdown).toContain('World');
	});

	it('generates a table of contents', () => {
		const el = html('<h2>Section A</h2><p>text</p><h2>Section B</h2><p>more</p>');
		const result = convertToMarkdown(el, []);
		expect(result.toc).toContain('Section A');
		expect(result.toc).toContain('Section B');
	});

	it('strips navigation and other chrome', () => {
		const el = html('<nav>menu</nav><p>Content</p><footer>foot</footer>');
		const result = convertToMarkdown(el, []);
		expect(result.markdown).not.toContain('menu');
		expect(result.markdown).not.toContain('foot');
		expect(result.markdown).toContain('Content');
	});

	it('converts code blocks with language', () => {
		const el = html('<pre><code class="language-js">const x = 1;</code></pre>');
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toContain('```');
		expect(result.markdown).toContain('const x = 1;');
	});

	it('handles GFM tables', () => {
		const el = html(`
			<table>
				<thead><tr><th>A</th><th>B</th></tr></thead>
				<tbody><tr><td>1</td><td>2</td></tr></tbody>
			</table>
		`);
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toContain('| A | B |');
		expect(result.markdown).toContain('| 1 | 2 |');
	});

	it('preserves indentation and blank lines in highlighted code', () => {
		const el = html(
			'<pre><code class="language-py">' +
				'<span class="line"><span>def f():</span></span>\n' +
				'<span class="line"><span>    </span><span>return 1</span></span>\n' +
				'<span class="line"></span>\n' +
				'<span class="line"><span>f()</span></span>' +
				'</code></pre>'
		);
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toBe('```py\ndef f():\n    return 1\n\nf()\n```');
	});

	it('widens the fence around code containing backticks', () => {
		const el = html('<pre><code class="language-md">Use ```js for JS fences</code></pre>');
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toBe('````md\nUse ```js for JS fences\n````');
	});

	it('keeps empty table cells so columns stay aligned', () => {
		const el = html(
			'<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
				'<tbody><tr><td>1</td><td></td></tr></tbody></table>'
		);
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toBe('| A | B |\n| --- | --- |\n| 1 |  |');
	});

	it('preserves line breaks, rules, and task list checkboxes', () => {
		const el = html('<p>one<br>two</p><hr><ul><li><input type="checkbox" checked>done</li></ul>');
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toContain('one\ntwo');
		expect(result.markdown).toContain('* * *');
		expect(result.markdown).toContain('[x] done');
	});

	it('replaces embedded media with descriptions', () => {
		const el = html(
			'<p>Before</p><iframe src="https://youtube.com/embed/xyz" title="Video"></iframe><p>After</p>'
		);
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toContain('Embedded iframe');
		expect(result.markdown).not.toContain('<iframe');
	});

	it('keeps code blocks wrapped in figures', () => {
		const el = html(
			'<p>Before</p><figure><pre data-language="jsx"><code>const x = 1;</code></pre></figure><p>After</p>'
		);
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toContain('```jsx\nconst x = 1;\n```');
	});

	it('renders image figures with captions', () => {
		const el = html(
			'<figure><img src="https://example.com/pic.png" alt="Pic" /><figcaption>A caption</figcaption></figure>'
		);
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toContain('![Pic](https://example.com/pic.png)');
		expect(result.markdown).toContain('_A caption_');
	});

	it('resolves footnote definitions from the document when absent from the content', () => {
		const definitions = document.createElement('div');
		definitions.innerHTML = '<ol><li id="fn-outside"><p>External definition text.</p></li></ol>';
		document.body.appendChild(definitions);
		try {
			const el = html('<p>Claim<sup><a href="#fn-outside">1</a></sup></p>');
			const result = convertToMarkdown(el, []);
			expect(result.markdown).toContain('Claim[^1]');
			expect(result.markdown).toContain('[^1]: External definition text.');
		} finally {
			definitions.remove();
		}
	});
});

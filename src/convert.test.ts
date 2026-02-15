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
	firstNonEmpty,
	generateTOC,
	normalizeLinks,
	postProcessMarkdown,
	slugify,
	stripFrontMatter,
	trimFencePadding,
	unwrapHeadingLinks,
} from './convert';

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
});

describe('buildOutput', () => {
	it('assembles front matter, TOC, and content', () => {
		const output = buildOutput('---\ntitle: "T"\n---', '- [A](#a)', 'Body');
		expect(output).toContain('## Table of Contents');
		expect(output).toContain('- [A](#a)');
		expect(output).toContain('Body');
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

	it('replaces embedded media with descriptions', () => {
		const el = html(
			'<p>Before</p><iframe src="https://youtube.com/embed/xyz" title="Video"></iframe><p>After</p>'
		);
		const result = convertToMarkdown(el, []);
		expect(result.markdown).toContain('Embedded iframe');
		expect(result.markdown).not.toContain('<iframe');
	});
});

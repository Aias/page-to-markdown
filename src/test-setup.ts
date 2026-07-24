/**
 * Browsers define `nodeName` only on `Node.prototype`, so reading it through that
 * unbound getter works for every node type. happy-dom instead defines the real
 * accessor on each subclass (`Element.prototype` and friends) and leaves the one on
 * `Node.prototype` returning an empty string.
 *
 * DOMPurify 3.4.8 began reading `nodeName` through the unbound `Node.prototype`
 * getter to harden against DOM clobbering. Under happy-dom every element therefore
 * reports an empty tag name, fails the allow-list, and gets stripped. Chrome is
 * unaffected — this restores browser behaviour so the suite exercises the real
 * sanitizer.
 *
 * Upstream: https://github.com/capricorn86/happy-dom/issues/2182 (fix pending in #2183).
 * Delete this file once happy-dom ships the fix; the guard below will already no-op.
 */
const baseDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeName');
const baseGetter = baseDescriptor?.get;

/** Finds the accessor a browser would have placed on `Node.prototype`. */
function resolveNodeName(node: Node): string {
	let proto = Object.getPrototypeOf(node);
	while (proto && proto !== Node.prototype) {
		const descriptor = Object.getOwnPropertyDescriptor(proto, 'nodeName');
		if (descriptor?.get) {
			return descriptor.get.call(node);
		}
		proto = Object.getPrototypeOf(proto);
	}
	return baseGetter ? baseGetter.call(node) : '';
}

if (baseDescriptor?.configurable && baseGetter?.call(document.createElement('div')) === '') {
	Object.defineProperty(Node.prototype, 'nodeName', {
		...baseDescriptor,
		get(this: Node) {
			return resolveNodeName(this);
		},
	});
}

/**
 * Custom splitText implementation with built-in kerning compensation.
 * Measures character positions before splitting, applies compensation,
 * then detects lines based on actual rendered positions.
 */
interface SplextOptions {
    /** Split type: chars, words, lines, or combinations like "chars,words" */
    type?: "chars" | "words" | "lines" | "chars,words" | "words,lines" | "chars,lines" | "chars,words,lines";
    charClass?: string;
    wordClass?: string;
    lineClass?: string;
    /** Auto-split on resize (observes parent element) */
    autoSplit?: boolean;
    /** Callback when resize triggers re-split (does not re-trigger initial animations) */
    onResize?: (result: Omit<SplextResult, "revert" | "dispose">) => void;
    /** Auto-revert when promise resolves (e.g., animation.finished) */
    revertOnComplete?: Promise<unknown>;
    /** Add CSS custom properties (--char-index, --word-index, --line-index) */
    propIndex?: boolean;
    /** Add will-change: transform, opacity to split elements for better animation performance */
    willChange?: boolean;
}
interface SplextResult {
    chars: HTMLSpanElement[];
    words: HTMLSpanElement[];
    lines: HTMLSpanElement[];
    /** Revert the element to its original state */
    revert: () => void;
    /** Cleanup observers and timers (must be called when using autoSplit) */
    dispose: () => void;
}
/**
 * Split text into characters, words, and lines with kerning compensation.
 */
declare function splext(element: HTMLElement, { type, charClass, wordClass, lineClass, autoSplit, onResize, revertOnComplete, propIndex, willChange, }?: SplextOptions): SplextResult;

export { type SplextOptions, type SplextResult, splext };

"use client";

import { splitText } from "motion-plus";
import {
  cloneElement,
  isValidElement,
  ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface SplitTextOptions {
  charClass?: string;
  wordClass?: string;
  lineClass?: string;
  splitBy?: string;
}

interface SplitResult {
  chars: Element[];
  words: Element[];
  lines: Element[];
}

interface SplitTextProps {
  children: ReactElement;
  onSplit: (result: SplitResult) => void;
  options?: SplitTextOptions;
  autoSplit?: boolean;
}

export function SplitText({
  children,
  onSplit,
  options,
  autoSplit = false,
}: SplitTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [childElement, setChildElement] = useState<HTMLElement | null>(null);

  // Stable refs for callbacks and options (prevents unnecessary effect re-runs)
  const onSplitRef = useRef(onSplit);
  const optionsRef = useRef(options);

  // Keep refs in sync with latest props (useLayoutEffect to update before other effects)
  useLayoutEffect(() => {
    onSplitRef.current = onSplit;
    optionsRef.current = options;
  });

  // Refs for autoSplit (no re-renders needed)
  const originalHtmlRef = useRef<string | null>(null);
  const hasMultipleLinesRef = useRef(false);
  const lastWidthRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSplitRef = useRef(false);

  const childRefCallback = useCallback((node: HTMLElement | null) => {
    setChildElement(node);
  }, []);

  // Initial split and animation
  useEffect(() => {
    if (!childElement) return;

    // Guard against double-execution in Strict Mode
    if (hasSplitRef.current) return;

    // Track mounted state for async cleanup
    let isMounted = true;

    document.fonts.ready.then(() => {
      // Bail out if unmounted or already split
      if (!isMounted || hasSplitRef.current) return;
      if (!containerRef.current) return;

      // Store original HTML before first split
      if (originalHtmlRef.current === null) {
        originalHtmlRef.current = childElement.innerHTML;
      }

      const result = splitText(childElement, optionsRef.current);

      // Mark as split to prevent re-runs
      hasSplitRef.current = true;

      // Track line count and initial width (for autoSplit)
      hasMultipleLinesRef.current = result.lines.length > 1;
      lastWidthRef.current = childElement.offsetWidth;

      // Reveal the container after splitting
      containerRef.current.style.visibility = "visible";

      // Invoke the callback with split elements
      onSplitRef.current(result);
    });

    return () => {
      isMounted = false;
    };
  }, [childElement]);

  // ResizeObserver for autoSplit
  useEffect(() => {
    if (!autoSplit || !childElement) return;

    const handleResize = () => {
      // Only re-split if we have multiple lines
      if (!hasMultipleLinesRef.current) return;
      if (originalHtmlRef.current === null) return;

      // Skip if width hasn't changed
      const currentWidth = childElement.offsetWidth;
      if (currentWidth === lastWidthRef.current) return;
      lastWidthRef.current = currentWidth;

      // Restore original HTML and re-split
      childElement.innerHTML = originalHtmlRef.current;
      const result = splitText(childElement, optionsRef.current);

      // Update line count (might become single line at wide widths)
      hasMultipleLinesRef.current = result.lines.length > 1;
    };

    let skipFirst = true;

    const resizeObserver = new ResizeObserver(() => {
      // Skip the initial callback that fires immediately on observe
      if (skipFirst) {
        skipFirst = false;
        return;
      }

      // Debounce: clear pending timer and set new one
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(handleResize, 100);
    });

    resizeObserver.observe(childElement);

    return () => {
      resizeObserver.disconnect();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [autoSplit, childElement]);

  if (!isValidElement(children)) {
    console.error("SplitText: children must be a single valid React element");
    return null;
  }

  // Clone the child and attach our callback ref
  const clonedChild = cloneElement(children, {
    ref: childRefCallback,
  } as Record<string, unknown>);

  return (
    <div ref={containerRef} style={{ visibility: "hidden" }}>
      {clonedChild}
    </div>
  );
}

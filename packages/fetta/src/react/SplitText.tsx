import { splitText, normalizeToPromise } from "../core/splitText";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface SplitTextOptions {
  type?:
    | "chars"
    | "words"
    | "lines"
    | "chars,words"
    | "words,lines"
    | "chars,lines"
    | "chars,words,lines";
  charClass?: string;
  wordClass?: string;
  lineClass?: string;
  /** Apply overflow mask wrapper to elements for reveal animations */
  mask?: "lines" | "words" | "chars";
  propIndex?: boolean;
  willChange?: boolean;
}

interface InViewOptions {
  /** How much of the element must be visible (0-1). Default: 0 */
  amount?: number;
  /** Root margin for IntersectionObserver. Default: "0px" */
  margin?: string;
  /** Only trigger once. Default: false */
  once?: boolean;
}

/** Result passed to callbacks, includes revert for manual control */
export interface SplitTextElements {
  chars: HTMLSpanElement[];
  words: HTMLSpanElement[];
  lines: HTMLSpanElement[];
  /** Revert to original HTML (manual control) */
  revert: () => void;
}

/** Return type for callbacks - void, single animation, array of animations, or promise */
type CallbackReturn =
  | void
  | { finished: Promise<unknown> }
  | Array<{ finished: Promise<unknown> }>
  | Promise<unknown>;

interface SplitTextProps {
  children: ReactElement;
  /**
   * Called after text is split.
   * Return an animation or promise to enable revert (requires revertOnComplete).
   * If inView is enabled, this is called immediately but animation typically runs in onInView.
   */
  onSplit?: (result: SplitTextElements) => CallbackReturn;
  /** Called when autoSplit triggers a re-split on resize */
  onResize?: (result: SplitTextElements) => void;
  options?: SplitTextOptions;
  autoSplit?: boolean;
  /** When true, reverts to original HTML after animation promise resolves */
  revertOnComplete?: boolean;
  /** Enable viewport detection. Pass true for defaults or InViewOptions for customization */
  inView?: boolean | InViewOptions;
  /** Called when element enters viewport. Return animation for revertOnComplete support */
  onInView?: (result: SplitTextElements) => CallbackReturn;
  /** Called when element leaves viewport */
  onLeaveView?: (result: SplitTextElements) => CallbackReturn;
}

/**
 * React component wrapper for the splitText function.
 * Uses the optimized splitText that handles kerning compensation
 * and dash splitting in a single pass.
 */
export const SplitText = forwardRef<HTMLDivElement, SplitTextProps>(
  function SplitText(
    {
      children,
      onSplit,
      onResize,
      options,
      autoSplit = false,
      revertOnComplete = false,
      inView,
      onInView,
      onLeaveView,
    },
    forwardedRef
  ) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Merge internal ref with forwarded ref
    const mergedRef = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );
  const [childElement, setChildElement] = useState<HTMLElement | null>(null);
  const [isInView, setIsInView] = useState(false);

  // Stable refs for callbacks and options
  const onSplitRef = useRef(onSplit);
  const onResizeRef = useRef(onResize);
  const optionsRef = useRef(options);
  const revertOnCompleteRef = useRef(revertOnComplete);
  const inViewRef = useRef(inView);
  const onInViewRef = useRef(onInView);
  const onLeaveViewRef = useRef(onLeaveView);

  useLayoutEffect(() => {
    onSplitRef.current = onSplit;
    onResizeRef.current = onResize;
    optionsRef.current = options;
    revertOnCompleteRef.current = revertOnComplete;
    inViewRef.current = inView;
    onInViewRef.current = onInView;
    onLeaveViewRef.current = onLeaveView;
  });

  // Refs for tracking state
  const hasSplitRef = useRef(false);
  const hasRevertedRef = useRef(false);
  const revertFnRef = useRef<(() => void) | null>(null);
  const splitResultRef = useRef<SplitTextElements | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasTriggeredOnceRef = useRef(false);

  const childRefCallback = useCallback((node: HTMLElement | null) => {
    setChildElement(node);
  }, []);

  // Initial split
  useEffect(() => {
    if (!childElement) return;
    if (hasSplitRef.current) return;

    let isMounted = true;

    document.fonts.ready.then(() => {
      if (!isMounted || hasSplitRef.current) return;
      if (!containerRef.current) return;

      // Use core splitText with autoSplit feature
      const result = splitText(childElement, {
        ...optionsRef.current,
        autoSplit,
        onResize: (resizeResult) => {
          // Update stored result with new elements but same revert
          const newSplitTextElements: SplitTextElements = {
            chars: resizeResult.chars,
            words: resizeResult.words,
            lines: resizeResult.lines,
            revert: result.revert,
          };
          splitResultRef.current = newSplitTextElements;
          onResizeRef.current?.(newSplitTextElements);
        },
      });

      // Store revert function for cleanup
      revertFnRef.current = result.revert;

      hasSplitRef.current = true;

      // Create result object with revert exposed
      const splitElements: SplitTextElements = {
        chars: result.chars,
        words: result.words,
        lines: result.lines,
        revert: result.revert,
      };
      splitResultRef.current = splitElements;

      // Reveal after split
      containerRef.current.style.visibility = "visible";

      // Call onSplit if provided
      if (onSplitRef.current) {
        const callbackResult = onSplitRef.current(splitElements);

        // Handle revertOnComplete for onSplit (only when inView is NOT enabled)
        if (!inViewRef.current && revertOnCompleteRef.current) {
          const promise = normalizeToPromise(callbackResult);
          if (promise) {
            promise
              .then(() => {
                if (!isMounted || hasRevertedRef.current) return;
                result.revert();
                hasRevertedRef.current = true;
              })
              .catch(() => {
                console.warn("[fetta] Animation rejected, text not reverted");
              });
          } else if (callbackResult === undefined) {
            // No warning if onSplit didn't return anything - user might be setting up state
          } else {
            console.warn(
              "SplitText: revertOnComplete is enabled but onSplit did not return an animation or promise."
            );
          }
        }
      }

      // Set up IntersectionObserver if inView is enabled
      if (inViewRef.current && containerRef.current) {
        const inViewOptions =
          typeof inViewRef.current === "object" ? inViewRef.current : {};
        const threshold = inViewOptions.amount ?? 0;
        const rootMargin = inViewOptions.margin ?? "0px";

        observerRef.current = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (!entry) return;

            const isOnce =
              typeof inViewRef.current === "object" && inViewRef.current.once;

            if (entry.isIntersecting) {
              if (isOnce && hasTriggeredOnceRef.current) return;
              hasTriggeredOnceRef.current = true;
              setIsInView(true);
            } else {
              if (!isOnce) {
                setIsInView(false);
              }
            }
          },
          { threshold, rootMargin }
        );

        observerRef.current.observe(containerRef.current);
      }
    });

    return () => {
      isMounted = false;
      // Cleanup observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      // Cleanup on unmount
      if (revertFnRef.current) {
        revertFnRef.current();
      }
    };
  }, [childElement, autoSplit]);

  // Handle isInView changes
  useEffect(() => {
    if (!splitResultRef.current) return;
    if (hasRevertedRef.current) return;

    if (isInView && onInViewRef.current) {
      const callbackResult = onInViewRef.current(splitResultRef.current);
      const promise = normalizeToPromise(callbackResult);

      if (revertOnCompleteRef.current && promise) {
        promise
          .then(() => {
            if (hasRevertedRef.current) return;
            splitResultRef.current?.revert();
            hasRevertedRef.current = true;
          })
          .catch(() => {
            console.warn("[fetta] Animation rejected, text not reverted");
          });
      }
    } else if (!isInView && onLeaveViewRef.current && splitResultRef.current) {
      onLeaveViewRef.current(splitResultRef.current);
    }
  }, [isInView]);

  if (!isValidElement(children)) {
    console.error("SplitText: children must be a single valid React element");
    return null;
  }

  const clonedChild = cloneElement(children, {
    ref: childRefCallback,
  } as Record<string, unknown>);

  return (
    <div
      ref={mergedRef}
      style={{ visibility: "hidden", position: "relative" }}
    >
      {clonedChild}
    </div>
  );
  }
);

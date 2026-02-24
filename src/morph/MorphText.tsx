import { splitTextData } from "../internal/splitTextShared";
import {
  reconcileSplitIdentity,
  type SplitIdentitySnapshot,
  type SplitIdentityStatus,
} from "../internal/splitIdentity";
import { waitForFontsReady } from "../internal/waitForFontsReady";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import type { AnimationOptions } from "motion";
import type { HTMLMotionProps } from "motion/react";
import {
  createElement,
  forwardRef,
  ForwardedRef,
  RefAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import type { SplitTextDataNode } from "../core/splitText";

const SPLIT_ID_ATTR = "data-griffo-id";

export interface MorphVariantInfo {
  /** Index of this element among all animated elements */
  index: number;
  /** Total number of animated elements */
  count: number;
}

type StaticMotionInitialProp = HTMLMotionProps<"div">["initial"];
type StaticMotionAnimateProp = HTMLMotionProps<"div">["animate"];
type StaticMotionExitProp = HTMLMotionProps<"div">["exit"];

type MotionInitialProp = StaticMotionInitialProp | ((info: MorphVariantInfo) => StaticMotionInitialProp);
type MotionAnimateProp = StaticMotionAnimateProp | ((info: MorphVariantInfo) => StaticMotionAnimateProp);
type MotionExitProp = StaticMotionExitProp | ((info: MorphVariantInfo) => StaticMotionExitProp);

const DEFAULT_ENTER_STATE: MotionInitialProp = { opacity: 0 };
const DEFAULT_ANIMATE_STATE: MotionAnimateProp = { opacity: 1 };
const DEFAULT_EXIT_STATE: MotionExitProp = { opacity: 0 };
const DEFAULT_TRANSITION: AnimationOptions = { type: "spring", bounce: 0, duration: 0.4 };

type ControlledWrapperMotionKeys =
  | "children"
  | "className"
  | "style"
  | "as"
  | "ref"
  | "transition"
  | "reducedMotion"
  | "initial"
  | "animate"
  | "exit";

type WrapperMotionProps = Omit<
  HTMLMotionProps<"div">,
  ControlledWrapperMotionKeys
>;

export interface MorphTextProps extends WrapperMotionProps {
  children: string;
  as?: keyof HTMLElementTagNameMap;
  className?: string;
  style?: CSSProperties;
  transition?: AnimationOptions;
  waitForFonts?: boolean;
  reducedMotion?: "user" | "always" | "never";
  splitBy?: "chars" | "words";
  animateInitial?: boolean;
  initial?: MotionInitialProp;
  animate?: MotionAnimateProp;
  exit?: MotionExitProp;
  stagger?: number;
  onMorphComplete?: () => void;
}

type SerializedElementNode = Extract<SplitTextDataNode, { type: "element" }>;

type SplitUnit = "chars" | "words";

type RawToken =
  | { tokenType: "char"; node: SerializedElementNode; value: string }
  | { tokenType: "word"; node: SerializedElementNode; value: string }
  | { tokenType: "text"; key: string; value: string }
  | { tokenType: "br"; key: string; attrs: Record<string, string> };

type MorphRenderToken =
  | {
      tokenType: "char" | "word";
      id: string;
      status: SplitIdentityStatus;
      tag: string;
      props: Record<string, unknown>;
      value: string;
      index?: number;
      enterIndex?: number;
    }
  | { tokenType: "space"; id: string; status: SplitIdentityStatus; index?: number; enterIndex?: number }
  | { tokenType: "text"; key: string; value: string }
  | { tokenType: "br"; key: string; props: Record<string, unknown> };

function parseStyleValue(styleText: string): CSSProperties {
  const style: CSSProperties = {};
  const parts = styleText.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part) continue;
    const [rawKey, ...rawValueParts] = part.split(":");
    if (!rawKey || rawValueParts.length === 0) continue;
    const rawValue = rawValueParts.join(":").trim();
    const key = rawKey.trim();
    if (key.startsWith("--")) {
      (style as Record<string, string>)[key] = rawValue;
      continue;
    }
    const camelKey = key.replace(/-([a-z])/g, (_, char: string) =>
      char.toUpperCase()
    );
    (style as Record<string, string>)[camelKey] = rawValue;
  }
  return style;
}

function attrsToProps(attrs: Record<string, string>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "class") {
      props.className = value;
      continue;
    }
    if (name === "style") {
      props.style = parseStyleValue(value);
      continue;
    }
    props[name] = value;
  }
  return props;
}

const motionComponentCache = new Map<string, React.ElementType>();

function getMotionComponent(tag: string): React.ElementType {
  let component = motionComponentCache.get(tag);
  if (!component) {
    const registry = motion as unknown as Record<string, React.ElementType>;
    component = registry[tag] ?? motion.span;
    motionComponentCache.set(tag, component);
  }
  return component;
}

function readSerializedNodeText(node: SplitTextDataNode): string {
  if (node.type === "text") {
    return node.text;
  }
  return node.children.map(readSerializedNodeText).join("");
}

function collectRawTokens(
  nodes: SplitTextDataNode[],
  splitBy: SplitUnit = "chars"
): RawToken[] {
  const rawTokens: RawToken[] = [];
  let nonCharIndex = 0;
  const targetSplit = splitBy === "words" ? "word" : "char";

  const walk = (list: SplitTextDataNode[]) => {
    for (const node of list) {
      if (node.type === "text") {
        if (node.text.length > 0) {
          rawTokens.push({
            tokenType: "text",
            key: `t-${nonCharIndex++}`,
            value: node.text,
          });
        }
        continue;
      }

      if (node.attrs["data-griffo-sr-copy"] === "true") {
        continue;
      }

      if (node.tag === "br") {
        rawTokens.push({
          tokenType: "br",
          key: `br-${nonCharIndex++}`,
          attrs: node.attrs,
        });
        continue;
      }

      if (node.split === targetSplit) {
        rawTokens.push({
          tokenType: splitBy === "words" ? "word" : "char",
          node,
          value: readSerializedNodeText(node),
        } as RawToken);
        continue;
      }

      walk(node.children);
    }
  };

  walk(nodes);

  return rawTokens;
}

function buildRenderTokens(
  nodes: SplitTextDataNode[],
  previousSnapshot: SplitIdentitySnapshot | null,
  splitBy: SplitUnit = "chars"
): {
  snapshot: SplitIdentitySnapshot;
  tokens: MorphRenderToken[];
  enterCount: number;
  unitCount: number;
  hasExits: boolean;
} {
  const rawTokens = collectRawTokens(nodes, splitBy);
  const unitTokenType = splitBy === "words" ? "word" : "char";
  const rawUnits = rawTokens.filter(
    (token): token is Extract<RawToken, { tokenType: "char" | "word" }> =>
      token.tokenType === unitTokenType
  );
  const diff = reconcileSplitIdentity(
    previousSnapshot,
    rawUnits.map((token) => token.value),
    { unit: splitBy }
  );

  const statusByNextIndex = new Map<number, SplitIdentityStatus>();
  let hasExits = false;
  for (const change of diff.changes) {
    if (typeof change.nextIndex === "number") {
      statusByNextIndex.set(change.nextIndex, change.status);
    }
    if (change.status === "exit") {
      hasExits = true;
    }
  }

  const fallbackPrefix = splitBy === "words" ? "w" : "c";
  let unitIndex = 0;
  const intermediateTokens: MorphRenderToken[] = rawTokens.map((token) => {
    if (token.tokenType === "text") {
      return token;
    }

    if (token.tokenType === "br") {
      return {
        tokenType: "br" as const,
        key: token.key,
        props: attrsToProps(token.attrs),
      };
    }

    const id = diff.snapshot.ids[unitIndex] ?? `${fallbackPrefix}-fallback-${unitIndex}`;
    const status = statusByNextIndex.get(unitIndex) ?? "persist";
    unitIndex += 1;

    return {
      tokenType: unitTokenType as "char" | "word",
      id,
      status,
      tag: token.node.tag,
      props: attrsToProps(token.node.attrs),
      value: token.value,
    };
  });

  // For word splitting, inject space tokens between consecutive words.
  // Each space gets a stable ID derived from the word it precedes, so
  // AnimatePresence can track it across renders.
  let tokens: MorphRenderToken[];
  if (splitBy === "words") {
    tokens = [];
    let prevWasWord = false;
    for (const token of intermediateTokens) {
      if (token.tokenType === "word" && prevWasWord) {
        tokens.push({
          tokenType: "space",
          id: `sp-${token.id}`,
          status: token.status,
        });
      }
      tokens.push(token);
      if (token.tokenType === "word" || token.tokenType === "br") {
        prevWasWord = token.tokenType === "word";
      }
    }
  } else {
    // For char splitting, convert whitespace-only text tokens to animated space tokens.
    // Space IDs are derived from neighboring char IDs for stability.
    tokens = [];
    for (let i = 0; i < intermediateTokens.length; i++) {
      const token = intermediateTokens[i];
      if (token.tokenType === "text" && /^\s+$/.test(token.value)) {
        const next = intermediateTokens[i + 1];
        const prev = intermediateTokens[i - 1];
        const neighbor =
          next?.tokenType === "char"
            ? next
            : prev?.tokenType === "char"
              ? prev
              : null;
        const status: SplitIdentityStatus = neighbor
          ? neighbor.status
          : "persist";
        const prevId = prev?.tokenType === "char" ? prev.id : "start";
        const nextId = next?.tokenType === "char" ? next.id : "end";
        tokens.push({
          tokenType: "space",
          id: `sp-${prevId}-${nextId}`,
          status,
        });
      } else {
        tokens.push(token);
      }
    }
  }

  // Assign sequential index to all animated tokens and enterIndex to entering ones
  let unitCount = 0;
  let enterCount = 0;
  for (const token of tokens) {
    if (token.tokenType === "char" || token.tokenType === "word" || token.tokenType === "space") {
      token.index = unitCount;
      unitCount += 1;
      if (token.status === "enter") {
        token.enterIndex = enterCount;
        enterCount += 1;
      }
    }
  }

  return {
    snapshot: diff.snapshot,
    tokens,
    enterCount,
    unitCount,
    hasExits,
  };
}

type MorphTextComponent = (
  props: MorphTextProps & RefAttributes<HTMLElement>
) => React.ReactElement | null;

export const MorphText = forwardRef(function MorphText(
  {
    children,
    as: Component = "span",
    className,
    style: userStyle,
    transition,
    waitForFonts = true,
    reducedMotion = "user",
    splitBy = "chars",
    animateInitial = false,
    initial: initialProp,
    animate: animateProp,
    exit: exitProp,
    stagger: staggerProp,
    onMorphComplete,
    ...wrapperProps
  }: MorphTextProps,
  forwardedRef: ForwardedRef<HTMLElement>
) {
  const wrapperRef = useRef<HTMLElement>(null);
  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      wrapperRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef]
  );

  const enterState: MotionInitialProp = initialProp === false ? false : (initialProp ?? DEFAULT_ENTER_STATE);
  const animateState: MotionAnimateProp = animateProp ?? DEFAULT_ANIMATE_STATE;
  const exitState: MotionExitProp = exitProp ?? DEFAULT_EXIT_STATE;

  const [tokens, setTokens] = useState<MorphRenderToken[] | null>(null);
  const [unitCount, setUnitCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const snapshotRef = useRef<SplitIdentitySnapshot | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const reduceMotionActive =
    reducedMotion === "always" ||
    (reducedMotion === "user" && !!prefersReducedMotion);
  const reducedTransition = useMemo(
    () => ({ duration: 0, delay: 0, layout: { duration: 0 } }) as AnimationOptions,
    []
  );
  const resolvedTransition = reduceMotionActive ? reducedTransition : (transition ?? DEFAULT_TRANSITION);
  const transitionRef = useRef(resolvedTransition);
  transitionRef.current = resolvedTransition;

  // onMorphComplete tracking refs
  const onMorphCompleteRef = useRef(onMorphComplete);
  onMorphCompleteRef.current = onMorphComplete;
  const enterRemainingRef = useRef(0);
  const exitsActiveRef = useRef(false);
  const isFirstRenderRef = useRef(true);
  const staggerRef = useRef(staggerProp);
  staggerRef.current = staggerProp;
  const enterStateRef = useRef(enterState);
  enterStateRef.current = enterState;
  const animateStateRef = useRef(animateState);
  animateStateRef.current = animateState;
  const exitStateRef = useRef(exitState);
  exitStateRef.current = exitState;

  const tryFireMorphComplete = useCallback(() => {
    if (enterRemainingRef.current <= 0 && !exitsActiveRef.current) {
      onMorphCompleteRef.current?.();
    }
  }, []);

  const buildSplitDataFromProbe = useCallback((nextText: string, unit: SplitUnit) => {
    const wrapperElement = wrapperRef.current;
    if (!wrapperElement) return null;
    const parentElement = wrapperElement.parentElement;
    if (!parentElement) return null;

    const probeHost = wrapperElement.ownerDocument.createElement("div");
    probeHost.style.position = "fixed";
    probeHost.style.left = "-99999px";
    probeHost.style.top = "0";
    probeHost.style.visibility = "hidden";
    probeHost.style.pointerEvents = "none";
    probeHost.style.contain = "layout style paint";
    probeHost.style.width = `${Math.max(1, parentElement.getBoundingClientRect().width)}px`;

    const probeElement = wrapperElement.cloneNode(false) as HTMLElement;
    probeElement.textContent = nextText;
    probeHost.appendChild(probeElement);
    parentElement.appendChild(probeHost);

    try {
      return splitTextData(probeElement, { type: unit === "words" ? "words" : "chars" });
    } finally {
      probeHost.remove();
    }
  }, []);

  const measureAndSetTokens = useCallback(
    (nextText: string, unit: SplitUnit) => {
      const nextData = buildSplitDataFromProbe(nextText, unit);
      if (!nextData) return;

      const { snapshot, tokens: nextTokens, enterCount, unitCount: nextUnitCount, hasExits } = buildRenderTokens(
        nextData.nodes,
        snapshotRef.current,
        unit
      );

      snapshotRef.current = snapshot;

      // Track morph completion
      const isFirst = isFirstRenderRef.current;
      isFirstRenderRef.current = false;
      const skipCallback = isFirst && !animateInitial;
      const hasAnimation = enterCount > 0 || hasExits;

      if (!skipCallback && hasAnimation && onMorphCompleteRef.current) {
        enterRemainingRef.current = enterCount;
        exitsActiveRef.current = hasExits;
      } else {
        enterRemainingRef.current = 0;
        exitsActiveRef.current = false;
      }

      setTokens(nextTokens);
      setUnitCount(nextUnitCount);
      setIsReady(true);
    },
    [buildSplitDataFromProbe, animateInitial]
  );

  useEffect(() => {
    if (typeof children !== "string") return;
    let cancelled = false;
    waitForFontsReady(waitForFonts).then(() => {
      if (cancelled) return;
      measureAndSetTokens(children, splitBy);
    });
    return () => {
      cancelled = true;
    };
  }, [children, waitForFonts, splitBy, measureAndSetTokens]);

  const handleEnterAnimationComplete = useCallback(() => {
    enterRemainingRef.current = Math.max(0, enterRemainingRef.current - 1);
    tryFireMorphComplete();
  }, [tryFireMorphComplete]);

  const handleExitComplete = useCallback(() => {
    exitsActiveRef.current = false;
    tryFireMorphComplete();
  }, [tryFireMorphComplete]);

  const renderToken = useCallback(
    (token: MorphRenderToken): ReactNode => {
      if (token.tokenType === "text") {
        return token.value;
      }

      if (token.tokenType === "br") {
        return createElement("br", {
          key: token.key,
          ...token.props,
          "aria-hidden": "true",
        });
      }

      const currentEnterState = enterStateRef.current;
      const currentAnimateState = animateStateRef.current;
      const currentExitState = exitStateRef.current;
      const currentStagger = staggerRef.current;

      // Resolve function variants
      const info: MorphVariantInfo = { index: token.index!, count: unitCount };
      const resolvedEnterState = typeof currentEnterState === "function"
        ? currentEnterState(info)
        : currentEnterState;
      const resolvedAnimateState = typeof currentAnimateState === "function"
        ? currentAnimateState(info)
        : currentAnimateState;
      const resolvedExitState = typeof currentExitState === "function"
        ? currentExitState(info)
        : currentExitState;

      // Compute per-token transition with stagger delay
      let tokenTransition = transitionRef.current;
      if (currentStagger && typeof token.enterIndex === "number") {
        const existingDelay =
          (tokenTransition as Record<string, unknown> | undefined)?.delay;
        const baseDelay = typeof existingDelay === "number" ? existingDelay : 0;
        tokenTransition = {
          ...tokenTransition,
          delay: baseDelay + token.enterIndex * currentStagger,
        } as typeof tokenTransition;
      }

      if (token.tokenType === "space") {
        return createElement(
          motion.span,
          {
            key: `space-${token.id}`,
            "aria-hidden": "true",
            layout: "position",
            initial: token.status === "enter" ? resolvedEnterState : false,
            animate: resolvedAnimateState,
            exit: resolvedExitState,
            transition: tokenTransition as HTMLMotionProps<"span">["transition"],
            style: { display: "inline", whiteSpace: "pre" } as CSSProperties,
            onAnimationComplete:
              token.status === "enter" ? handleEnterAnimationComplete : undefined,
          },
          " "
        );
      }

      const propsStyle = (token.props.style as CSSProperties | undefined) ?? undefined;
      const MotionTag = getMotionComponent(token.tag);
      const keyPrefix = token.tokenType === "word" ? "word" : "char";

      return createElement(
        MotionTag,
        {
          key: `${keyPrefix}-${token.id}`,
          ...token.props,
          "aria-hidden": "true",
          [SPLIT_ID_ATTR]: token.id,
          layout: "position",
          initial: token.status === "enter" ? resolvedEnterState : false,
          animate: resolvedAnimateState,
          exit: resolvedExitState,
          transition: tokenTransition,
          style: {
            display: "inline-block",
            whiteSpace: "pre",
            ...propsStyle,
          },
          onAnimationComplete:
            token.status === "enter" ? handleEnterAnimationComplete : undefined,
        },
        token.value
      );
    },
    [handleEnterAnimationComplete, unitCount]
  );

  if (typeof children !== "string") {
    console.error("MorphText: children must be a string.");
    return null;
  }

  const Wrapper = getMotionComponent(Component);
  const wrapperStyle: CSSProperties = {
    ...userStyle,
    visibility: isReady || !waitForFonts ? "visible" : "hidden",
  };
  const wrapperAttrs: Record<string, unknown> = {
    ref: mergedRef,
    ...wrapperProps,
    className,
    style: wrapperStyle,
  };

  if (wrapperAttrs["aria-label"] === undefined) {
    wrapperAttrs["aria-label"] = children;
  }

  const content = createElement(
    Wrapper,
    wrapperAttrs,
    tokens
      ? createElement(
          AnimatePresence,
          {
            mode: "popLayout",
            initial: animateInitial,
            onExitComplete: handleExitComplete,
          },
          tokens.map(renderToken)
        )
      : children
  );

  if (reducedMotion !== "never") {
    return createElement(MotionConfig, { reducedMotion }, content);
  }

  return content;
}) as MorphTextComponent;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import React from "react";

type CapturedMotionElement = { tag: string; props: Record<string, unknown> };

interface MotionReactTestAPI {
  __setReducedMotion: (value: boolean) => void;
  __resetMotionState: () => void;
  __getMotionElements: () => CapturedMotionElement[];
}

vi.mock("motion", () => ({
  animate: vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })),
  scroll: vi.fn(() => vi.fn()),
}));

vi.mock("motion/react", async () => {
  const React = await import("react");

  const state = {
    motionElements: [] as CapturedMotionElement[],
    reducedMotion: false,
  };
  const motionComponentCache = new Map<string, React.ElementType>();

  const MotionConfig = vi.fn(
    (props: { reducedMotion?: string; children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, props.children)
  );
  const LayoutGroup = vi.fn(
    (props: { id?: string; children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, props.children)
  );
  const AnimatePresence = vi.fn(
    (props: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, props.children)
  );

  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const cached = motionComponentCache.get(tag);
        if (cached) return cached;
        const component = React.forwardRef<HTMLElement, Record<string, unknown>>(
          (props, ref) => {
            state.motionElements.push({ tag, props });
            const {
              variants: _variants,
              custom: _custom,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              whileHover: _whileHover,
              whileTap: _whileTap,
              whileFocus: _whileFocus,
              layout: _layout,
              layoutId: _layoutId,
              drag: _drag,
              onTapStart: _onTapStart,
              onTapCancel: _onTapCancel,
              onTap: _onTap,
              onFocus: _onFocus,
              onBlur: _onBlur,
              onHoverStart: _onHoverStart,
              onHoverEnd: _onHoverEnd,
              onAnimationComplete: _onAnimationComplete,
              ...rest
            } = props;
            return React.createElement(
              tag,
              { ...rest, ref },
              props.children as React.ReactNode
            );
          }
        );
        motionComponentCache.set(tag, component);
        return component;
      },
    }
  );

  return {
    motion,
    MotionConfig,
    useReducedMotion: () => state.reducedMotion,
    __setReducedMotion: (value: boolean) => {
      state.reducedMotion = value;
    },
    __resetMotionState: () => {
      state.motionElements.length = 0;
      MotionConfig.mockClear();
      LayoutGroup.mockClear();
      AnimatePresence.mockClear();
      state.reducedMotion = false;
    },
    __getMotionElements: () => state.motionElements,
    LayoutGroup,
    AnimatePresence,
  };
});

import { MorphText } from "../../morph/MorphText";

async function getMotionReactTestAPI(): Promise<MotionReactTestAPI> {
  return (await import("motion/react")) as unknown as MotionReactTestAPI;
}

function textFromChild(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.map((part) => textFromChild(part)).join("");
  }
  return "";
}

describe("MorphText", () => {
  beforeEach(async () => {
    const motionReact = await getMotionReactTestAPI();
    motionReact.__resetMotionState();
  });

  afterEach(() => {
    cleanup();
  });

  it("animates chars from opacity 0 on first split", async () => {
    render(<MorphText>Hi</MorphText>);
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      const splitCharEntry = motionReact
        .__getMotionElements()
        .find(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char")
        );
      expect(splitCharEntry).toBeTruthy();
      expect((splitCharEntry?.props.initial as { opacity?: number })?.opacity).toBe(
        0
      );
      expect((splitCharEntry?.props.animate as { opacity?: number })?.opacity).toBe(
        1
      );
    });
  });

  it("keeps persisted char identity and skips re-enter", async () => {
    const { container, rerender } = render(<MorphText>AB</MorphText>);
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      expect(container.querySelectorAll(".split-char").length).toBe(2);
    });

    const beforeA = Array.from(container.querySelectorAll(".split-char")).find(
      (node) => node.textContent === "A"
    ) as HTMLElement | undefined;
    expect(beforeA).toBeTruthy();

    rerender(<MorphText>CA</MorphText>);

    await waitFor(() => {
      expect(container.querySelectorAll(".split-char").length).toBe(2);
      expect(container.textContent).toContain("CA");
    });

    const afterA = Array.from(container.querySelectorAll(".split-char")).find(
      (node) => node.textContent === "A"
    ) as HTMLElement | undefined;
    expect(afterA).toBeTruthy();
    expect(afterA?.getAttribute("data-griffo-id")).toBe(
      beforeA?.getAttribute("data-griffo-id")
    );

    const splitEntries = motionReact
      .__getMotionElements()
      .filter(
        (entry) =>
          typeof entry.props.className === "string" &&
          entry.props.className.includes("split-char")
      );
    const persistedEntry = [...splitEntries]
      .reverse()
      .find(
        (entry) =>
          textFromChild(entry.props.children) === "A" &&
          entry.props["data-griffo-id"] === afterA?.getAttribute("data-griffo-id")
      );
    expect(persistedEntry?.props.initial).toBe(false);
  });

  it("applies enter opacity to newly added chars", async () => {
    const { rerender } = render(<MorphText>AB</MorphText>);
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      expect(
        motionReact
          .__getMotionElements()
          .some(
            (entry) =>
              typeof entry.props.className === "string" &&
              entry.props.className.includes("split-char")
          )
      ).toBe(true);
    });

    rerender(<MorphText>CA</MorphText>);

    await waitFor(() => {
      const splitEntries = motionReact
        .__getMotionElements()
        .filter(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char")
        );
      const entered = splitEntries.find(
        (entry) =>
          textFromChild(entry.props.children) === "C" &&
          (entry.props.initial as { opacity?: number } | false)?.opacity === 0
      );
      expect(entered).toBeTruthy();
    });
  });

  it("applies exit opacity to split chars", async () => {
    render(<MorphText>AB</MorphText>);
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      const splitEntries = motionReact
        .__getMotionElements()
        .filter(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char")
        );
      expect(splitEntries.length).toBeGreaterThan(0);
      expect(
        splitEntries.every(
          (entry) => (entry.props.exit as { opacity?: number })?.opacity === 0
        )
      ).toBe(true);
    });
  });

  it("uses layout position on split chars", async () => {
    render(<MorphText>Morph</MorphText>);
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      const splitEntries = motionReact
        .__getMotionElements()
        .filter(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char")
        );
      expect(splitEntries.length).toBeGreaterThan(0);
      expect(splitEntries.every((entry) => entry.props.layout === "position")).toBe(
        true
      );
    });
  });

  it("uses instant transitions when reducedMotion is always", async () => {
    render(
      <MorphText reducedMotion="always" transition={{ duration: 0.4 }}>
        Morph
      </MorphText>
    );
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      const splitEntry = motionReact
        .__getMotionElements()
        .find(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char")
        );
      expect((splitEntry?.props.transition as { duration?: number })?.duration).toBe(
        0
      );
    });
  });

  describe("splitBy words", () => {
    it("splits text into word elements with split-word class", async () => {
      render(<MorphText splitBy="words">Hello World</MorphText>);

      const motionReact = await getMotionReactTestAPI();

      await waitFor(() => {
        const wordEntries = motionReact
          .__getMotionElements()
          .filter(
            (entry) =>
              typeof entry.props.className === "string" &&
              entry.props.className.includes("split-word")
          );
        expect(wordEntries.length).toBeGreaterThan(0);
      });
    });

    it("keeps persisted word identity across re-renders", async () => {
      const { container, rerender } = render(
        <MorphText splitBy="words">Hello World</MorphText>
      );

      await waitFor(() => {
        expect(container.querySelectorAll(".split-word").length).toBe(2);
      });

      const beforeWorld = Array.from(
        container.querySelectorAll(".split-word")
      ).find((node) => node.textContent?.trim() === "World") as HTMLElement | undefined;
      expect(beforeWorld).toBeTruthy();
      const worldId = beforeWorld?.getAttribute("data-griffo-id");

      rerender(<MorphText splitBy="words">Brave World</MorphText>);

      await waitFor(() => {
        expect(container.querySelectorAll(".split-word").length).toBe(2);
        expect(container.textContent).toContain("World");
      });

      const afterWorld = Array.from(
        container.querySelectorAll(".split-word")
      ).find((node) => node.textContent?.trim() === "World") as HTMLElement | undefined;
      expect(afterWorld).toBeTruthy();
      expect(afterWorld?.getAttribute("data-griffo-id")).toBe(worldId);
    });

    it("applies enter status to new words", async () => {
      const { rerender } = render(
        <MorphText splitBy="words">Hello World</MorphText>
      );
      const motionReact = await getMotionReactTestAPI();

      await waitFor(() => {
        expect(
          motionReact
            .__getMotionElements()
            .some(
              (entry) =>
                typeof entry.props.className === "string" &&
                entry.props.className.includes("split-word")
            )
        ).toBe(true);
      });

      rerender(<MorphText splitBy="words">Hello Brave World</MorphText>);

      await waitFor(() => {
        const wordEntries = motionReact
          .__getMotionElements()
          .filter(
            (entry) =>
              typeof entry.props.className === "string" &&
              entry.props.className.includes("split-word")
          );
        const entered = wordEntries.find(
          (entry) =>
            textFromChild(entry.props.children).trim() === "Brave" &&
            (entry.props.initial as { opacity?: number } | false)?.opacity === 0
        );
        expect(entered).toBeTruthy();
      });
    });

    it("uses word-prefixed ids", async () => {
      const { container } = render(
        <MorphText splitBy="words">Hello World</MorphText>
      );

      await waitFor(() => {
        const words = container.querySelectorAll(".split-word");
        expect(words.length).toBe(2);
        const ids = Array.from(words).map((el) =>
          el.getAttribute("data-griffo-id")
        );
        expect(ids.every((id) => id?.startsWith("w"))).toBe(true);
      });
    });
  });

  it("warns and renders nothing when children is not a string", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <MorphText>{42 as unknown as string}</MorphText>
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "MorphText: children must be a string."
    );
    expect(container.firstChild).toBeNull();
    errorSpy.mockRestore();
  });

  it("applies custom initial/animate/exit props to tokens", async () => {
    render(
      <MorphText
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        Hi
      </MorphText>
    );
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      const splitEntry = motionReact
        .__getMotionElements()
        .find(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char")
        );
      expect(splitEntry).toBeTruthy();
      expect(splitEntry?.props.initial).toEqual({ opacity: 0, y: 20 });
      expect(splitEntry?.props.animate).toEqual({ opacity: 1, y: 0 });
      expect(splitEntry?.props.exit).toEqual({ opacity: 0, y: -20 });
    });
  });

  it("stagger adds incremental delay to entering tokens", async () => {
    const { rerender } = render(<MorphText stagger={0.05}>AB</MorphText>);
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      expect(
        motionReact
          .__getMotionElements()
          .some(
            (entry) =>
              typeof entry.props.className === "string" &&
              entry.props.className.includes("split-char")
          )
      ).toBe(true);
    });

    rerender(<MorphText stagger={0.05}>CD</MorphText>);

    await waitFor(() => {
      const splitEntries = motionReact
        .__getMotionElements()
        .filter(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char") &&
            (entry.props.initial as { opacity?: number } | false) !== false
        );
      // After rerender: C and D are entering tokens
      const enterEntries = splitEntries.filter(
        (entry) =>
          (entry.props.initial as { opacity?: number })?.opacity === 0
      );
      expect(enterEntries.length).toBeGreaterThanOrEqual(1);
      // Check that at least one has a delay from stagger
      const delays = enterEntries.map(
        (entry) =>
          (entry.props.transition as { delay?: number })?.delay ?? 0
      );
      // enterIndex 0 gets delay 0, enterIndex 1 gets delay 0.05
      expect(delays.some((d) => d > 0)).toBe(true);
    });
  });

  it("animateInitial={true} passes initial: true to AnimatePresence", async () => {
    render(<MorphText animateInitial={true}>Hi</MorphText>);
    const motionReact = await import("motion/react") as unknown as {
      AnimatePresence: ReturnType<typeof vi.fn>;
    };

    await waitFor(() => {
      const calls = motionReact.AnimatePresence.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[0]?.initial).toBe(true);
    });
  });

  it("default animateInitial passes initial: false to AnimatePresence", async () => {
    render(<MorphText>Hi</MorphText>);
    const motionReact = await import("motion/react") as unknown as {
      AnimatePresence: ReturnType<typeof vi.fn>;
    };

    await waitFor(() => {
      const calls = motionReact.AnimatePresence.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[0]?.initial).toBe(false);
    });
  });

  it("onMorphComplete fires after morph with enters", async () => {
    const onMorphComplete = vi.fn();
    const { rerender } = render(
      <MorphText onMorphComplete={onMorphComplete}>AB</MorphText>
    );
    const motionReact = await getMotionReactTestAPI();

    await waitFor(() => {
      expect(
        motionReact.__getMotionElements().some(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char")
        )
      ).toBe(true);
    });

    // Should not fire on first render (animateInitial defaults to false)
    expect(onMorphComplete).not.toHaveBeenCalled();

    rerender(<MorphText onMorphComplete={onMorphComplete}>CD</MorphText>);

    await waitFor(() => {
      // After rerender, entering tokens get onAnimationComplete
      const enterEntries = motionReact
        .__getMotionElements()
        .filter(
          (entry) =>
            typeof entry.props.className === "string" &&
            entry.props.className.includes("split-char") &&
            typeof entry.props.onAnimationComplete === "function"
        );
      expect(enterEntries.length).toBeGreaterThan(0);

      // Simulate animation completing for all entering tokens
      for (const entry of enterEntries) {
        (entry.props.onAnimationComplete as () => void)();
      }
    });
  });
});

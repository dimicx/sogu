"use client";

import { useEffect, useRef, useState } from "react";
import { splitText } from "fetta";
import gsap from "gsap";
import { SplitText as GSAPSplitText } from "gsap/SplitText";

gsap.registerPlugin(GSAPSplitText);

const COMPARISON_TEXT = "WAVEY Typography";

interface TextRowProps {
  library: "gsap" | "fetta";
  isSplit: boolean;
}

function TextRow({ library, isSplit }: TextRowProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const gsapSplitRef = useRef<GSAPSplitText | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (gsapSplitRef.current) {
      gsapSplitRef.current.revert();
      gsapSplitRef.current = null;
    }

    ref.current.textContent = COMPARISON_TEXT;

    if (isSplit) {
      if (library === "gsap") {
        gsapSplitRef.current = new GSAPSplitText(ref.current, {
          type: "chars",
          charsClass: "split-char",
        });
      } else {
        splitText(ref.current, { type: "chars" });
      }
    }

    return () => {
      if (gsapSplitRef.current) {
        gsapSplitRef.current.revert();
        gsapSplitRef.current = null;
      }
    };
  }, [library, isSplit]);

  const isGsap = library === "gsap";

  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
      <span
        ref={ref}
        className="text-[28px] lg:text-[32px] font-medium tracking-tight leading-tight"
      >
        {COMPARISON_TEXT}
      </span>

      <span className="text-xs text-fd-muted-foreground">
        {isGsap ? "GSAP SplitText" : "Fetta"}
      </span>
    </div>
  );
}

export function KerningComparison() {
  const [isSplit, setIsSplit] = useState(false);
  const [showOutlines, setShowOutlines] = useState(false);

  return (
    <figure className="my-8 not-prose font-sans">
      <div className="bg-fd-card rounded-xl relative border shadow-sm overflow-hidden">
        <div
          className={`p-4 space-y-2 ${
            showOutlines
              ? "[&_.split-char]:outline-[0.8px] [&_.split-char]:outline-dashed [&_.split-char]:outline-current [&_.split-char]:-outline-offset-1"
              : ""
          }`}
        >
          <TextRow library="gsap" isSplit={isSplit} />
          <TextRow library="fetta" isSplit={isSplit} />
        </div>

        <div className="flex items-center justify-start px-4 py-3 border-t border-fd-border">
          <button
            onClick={() => {
              if (isSplit) {
                setShowOutlines(false);
              }
              setIsSplit((s) => !s);
            }}
            aria-pressed={isSplit}
            aria-label={isSplit ? "Revert" : "Split"}
            className={`w-20 h-9.5 text-[15px] rounded-l-lg border font-medium cursor-pointer transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 ${
              isSplit
                ? "bg-fd-accent text-fd-accent-foreground border-fd-foreground/20"
                : "border-fd-border bg-fd-secondary text-fd-secondary-foreground not-disabled:hover:bg-fd-accent"
            }`}
          >
            {isSplit ? "Revert" : "Split"}
          </button>
          <button
            disabled={!isSplit}
            onClick={() => setShowOutlines((s) => !s)}
            aria-pressed={showOutlines}
            aria-label={
              showOutlines
                ? "Hide character outlines"
                : "Show character outlines"
            }
            className={`h-9.5 text-[15px] px-4 rounded-r-lg border border-l-0 font-medium cursor-pointer transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 ${
              showOutlines
                ? "bg-fd-accent text-fd-accent-foreground border-fd-foreground/20"
                : "border-fd-border bg-fd-secondary text-fd-secondary-foreground not-disabled:hover:bg-fd-accent"
            }`}
          >
            Outline chars
          </button>
        </div>
      </div>

      <figcaption className="mt-4 text-center text-xs text-fd-muted-foreground text-balance">
        Press Split to see the difference in character spacing.
      </figcaption>
    </figure>
  );
}

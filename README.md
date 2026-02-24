# Griffo

Kerning-aware text splitting.

Split text into characters, words, and lines for animation — without breaking your typography. Most splitting libraries wrap each character in a `<span>` and call it done, but that destroys the kerning between character pairs. Griffo compensates for this automatically.

Docs: https://griffo.dimi.me/

## Install

```bash
npm install griffo
```

## Quick Start

### Vanilla

```ts
import { splitText } from "griffo";
import { animate, stagger } from "motion";

const { chars } = splitText(document.querySelector("h1"), { type: "chars" });
animate(chars, { opacity: [0, 1], y: [20, 0] }, { delay: stagger(0.02) });
```

### React

```tsx
import { SplitText } from "griffo/react";
import { animate, stagger } from "motion";

<SplitText
  options={{ type: "words" }}
  onSplit={({ words }) => {
    animate(words, { opacity: [0, 1], y: [20, 0] }, { delay: stagger(0.05) });
  }}
>
  <h1>Hello World</h1>
</SplitText>
```

### Motion

```tsx
import { SplitText } from "griffo/motion";
import { stagger } from "motion";

<SplitText
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.65, delay: stagger(0.04) }}
  options={{ type: "words" }}
>
  <h1>Hello World</h1>
</SplitText>
```

### Morph

```tsx
import { MorphText } from "griffo/morph";

<MorphText>{text}</MorphText>
```

## Features

- **Kerning Compensation** — Maintains original character spacing when splitting by chars
- **Nested Elements** — Preserves `<a>`, `<em>`, `<strong>` and other inline elements with all attributes
- **Line Detection** — Groups words into rendered lines
- **Dash Handling** — Wraps naturally after em-dashes, en-dashes, hyphens, and slashes
- **Auto Re-split** — Re-splits on container resize
- **Auto Revert** — Restores original HTML after animations
- **Masking** — Clip containers for reveal animations
- **Emoji Support** — Handles compound emojis and complex Unicode characters
- **Accessible** — Automatic screen reader support, even with nested links or emphasis
- **TypeScript** — Full type definitions included
- **Zero Dependencies** — 7 kB core with no external packages
- **Library Agnostic** — Works with Motion, GSAP, CSS, WAAPI, or any animation code

## Entry Points

| Import | Use for | Size |
|------|------|------|
| `griffo` | Vanilla JS or any framework | 7.11 kB |
| `griffo/react` | React with callback/lifecycle control | 8.23 kB |
| `griffo/motion` | Declarative Motion animations | 13.78 kB |
| `griffo/morph` | Standalone MorphText component | 7.95 kB |

Sizes are minified + brotli.

## API Overview

Full API reference at [griffo.dimi.me](https://griffo.dimi.me/). Summary below.

### `splitText(element, options?)` — [Core docs](https://griffo.dimi.me/api/core)

Returns `{ chars, words, lines, revert }`. Key options: `type`, `mask`, `autoSplit`, `onSplit`, `revertOnComplete`, `initialStyles`, `propIndex`.

```ts
import { splitText } from "griffo";
import { animate, stagger } from "motion";

document.fonts.ready.then(() => {
  const { words } = splitText(element, { type: "words", mask: "words" });
  animate(words, { y: ["100%", "0%"] }, { delay: stagger(0.1) });
});
```

### `<SplitText>` — [React docs](https://griffo.dimi.me/api/react)

Wraps `splitText()` with React lifecycle, viewport callbacks, and automatic cleanup. Key props: `onSplit`, `onResplit`, `options`, `autoSplit`, `waitForFonts`, `revertOnComplete`, `viewport`, `onViewportEnter`, `initialStyles`.

```tsx
import { SplitText } from "griffo/react";
import { animate, stagger } from "motion";

<SplitText
  options={{ type: "words" }}
  initialStyles={{ words: { opacity: 0, transform: "translateY(20px)" } }}
  viewport={{ amount: 0.5 }}
  onViewportEnter={({ words }) =>
    animate(words, { opacity: 1, y: 0 }, { delay: stagger(0.05) })
  }
  resetOnViewportLeave
>
  <p>Animates when scrolled into view</p>
</SplitText>
```

### `<SplitText>` — [Motion docs](https://griffo.dimi.me/api/motion)

Includes all React props plus Motion animation: `variants`, `initial`, `animate`, `exit`, `whileInView`, `whileScroll`, `whileHover`, `whileTap`, `whileFocus`, `transition`, `delayScope`, `custom`. Supports flat targets, per-type targets (`chars`/`words`/`lines`/`wrapper`), and function variants.

```tsx
import { SplitText } from "griffo/motion";
import { stagger } from "motion";

<SplitText
  variants={{
    hidden: { chars: { opacity: 0, y: 10 } },
    visible: {
      chars: ({ lineIndex }) => ({
        opacity: 1,
        y: 0,
        transition: {
          delay: stagger(0.02, { startDelay: lineIndex * 0.15 }),
        },
      }),
    },
  }}
  initial="hidden"
  animate="visible"
  options={{ type: "chars,lines", mask: "lines" }}
>
  <p>Per-line staggered reveal</p>
</SplitText>
```

### `<MorphText>` — [Morph docs](https://griffo.dimi.me/api/morph)

Text morphing with stable token identity. Matching tokens interpolate position, new tokens enter, removed tokens exit. Supports `splitBy="chars"` (default) and `splitBy="words"`. The `initial`, `animate`, and `exit` props accept static targets or `({ index, count }) => Target` callbacks.

```tsx
import { MorphText } from "griffo/morph";

<MorphText
  splitBy="words"
  initial={({ index, count }) => ({
    opacity: 0,
    x: index <= count / 2 ? -75 : 75,
  })}
  animate={{ opacity: 1, x: 0 }}
>
  {statusText}
</MorphText>
```

### `createSplitClones()` — [Helpers docs](https://griffo.dimi.me/api/helpers)

Creates clone layers from split output for reveal/swap effects. Pass an existing `splitText()` result.

```ts
import { splitText } from "griffo";
import { createSplitClones } from "griffo/helpers";

const split = splitText(element, { type: "chars", mask: "chars" });
const layers = createSplitClones(split, { unit: "chars", wrap: true });
// animate layers.originals + layers.clones...
layers.cleanup();
```

## Notes

- Ligatures are disabled (`font-variant-ligatures: none`) because ligatures can't span multiple elements.
- React and Motion components wait for fonts by default (`waitForFonts`). In vanilla, wrap calls in `document.fonts.ready`.
- Accessibility is automatic: headings get `aria-label`, generic elements get a screen-reader-only copy.

## Sponsors

If you find Griffo useful, consider [sponsoring the project](https://github.com/sponsors/dimicx) to support continued development.

## License

MIT

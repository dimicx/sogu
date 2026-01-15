# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js project showcasing a custom `SplitText` implementation for advanced text animation effects. The project implements a sophisticated text-splitting utility that addresses kerning compensation and natural line wrapping with special character handling (em-dashes, en-dashes).

## Development Commands

```bash
# Start development server (opens on http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Architecture

### Core Implementation

The project contains two parallel implementations:

1. **Custom SplitText** (`app/split-text/`)
   - `splitText.ts` - Core splitting logic with built-in kerning compensation
   - `index.tsx` - React component wrapper

2. **Motion Plus SplitText** (`app/components/SplitText.tsx`)
   - Uses `motion-plus` library's `splitText` function
   - Adds custom kerning compensation and dash-splitting logic on top

### Key Architectural Features

**Kerning Compensation System**
The core innovation is measuring character positions BEFORE splitting, then applying margin adjustments AFTER splitting to maintain original typography:

1. Measure original character positions using Range API
2. Split text into span elements
3. Calculate gap differences between original and split positions
4. Apply `marginLeft` adjustments to each character

This approach is documented in `app/split-text/splitText.ts:193-223`.

**Dash Handling**
Text can wrap naturally after em-dashes (—) and en-dashes (–):
- Words are split at these characters into separate word elements
- Continuation segments (after dashes) are marked with `noSpaceBefore` flag
- Spaces are conditionally inserted based on this flag

See `app/split-text/splitText.ts:42-108` for measurement logic.

**AutoSplit Feature**
The implementation supports automatic re-splitting on resize:
- Uses ResizeObserver on parent element
- Debounces resize events (100ms)
- Restores original HTML and re-measures before splitting
- Optional `onResize` callback for handling re-animations

**Revert on Complete**
Text can be reverted to original HTML after animation completes:
- Pass a Promise (e.g., `animate(...).finished`) to `revertOnComplete` option
- Automatically calls `revert()` when promise resolves
- Cleans up observers and timers via `dispose()`

### Component Structure

- `app/page.tsx` - Main demo page with multiple animation examples
- `app/example.tsx` - Basic example using motion-plus directly
- `app/comparison/page.tsx` - Comparison page (assumed)
- `app/layout.tsx` - Root layout

## Important Implementation Details

### Font Ligatures
The implementation **disables font ligatures** (`font-variant-ligatures: none`) because ligatures cannot span multiple span elements. This is set permanently and maintained even after revert.

### Accessibility
Split text elements automatically receive `aria-label` with the original text content for screen readers.

### Line Detection
Lines are detected by Y-position clustering after kerning compensation is applied. Words with Y-positions within 5px tolerance are grouped into the same line.

### State Management in React Component
The React wrapper (`app/split-text/index.tsx`) uses:
- `useRef` to avoid re-renders from prop changes
- `useLayoutEffect` to keep refs in sync before effects run
- Guards against double-execution in React StrictMode
- Cleanup via returned functions in `useEffect`

## CSS Classes

Default classes applied to split elements:
- `.split-char` - Individual characters
- `.split-word` - Word wrappers
- `.split-line` - Line wrappers (display: block)

All can be customized via options.

## TypeScript

Project uses strict TypeScript with:
- Target: ES2017
- JSX: react-jsx
- Path alias: `@/*` maps to project root
- Bundler module resolution (Next.js)

## Dependencies

Key dependencies:
- `motion` - Animation library
- `motion-plus` - Extended motion utilities including splitText
- `next` 16.1.1
- `react` 19.2.3
- `tailwindcss` 4.x

## Working with the Code

### Testing Changes
There are no automated tests. Test changes by:
1. Running `npm run dev`
2. Viewing http://localhost:3000
3. Checking multiple examples on the page
4. Testing responsive behavior by resizing the browser

### Adding New Animation Examples
New examples follow this pattern in `app/page.tsx`:
```tsx
<SplitText
  onSplit={({ chars, words, lines }) => {
    animate(elements, props, options);
  }}
  options={{ charClass, wordClass, lineClass }}
  autoSplit={boolean}
  revertOnComplete={boolean}
>
  <element>Text content</element>
</SplitText>
```

### Debugging Split Issues
If text doesn't split correctly:
1. Check that fonts are loaded (`document.fonts.ready`)
2. Verify element has actual text content
3. Check console for warnings about missing parent (autoSplit)
4. Inspect applied `data-*` attributes and margins
5. Verify ligatures are disabled

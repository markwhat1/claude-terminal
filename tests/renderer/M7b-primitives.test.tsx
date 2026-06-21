/**
 * M7b: shadcn primitives (Card, Skeleton) + CSS token registration tests.
 *
 * CSS token tests read globals.css directly and verify the registered hex
 * values, since jsdom does not process Tailwind @theme inline blocks.
 * Contrast is computed as WCAG relative luminance ratio (AA = 4.5:1 normal,
 * 3:1 large text; we use 4.5 as the conservative floor throughout).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers: WCAG relative luminance + contrast ratio
// ---------------------------------------------------------------------------

/** Parse a hex color string (#rrggbb or #rgb) into [r, g, b] in 0..255. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

/** WCAG relative luminance of an sRGB triple (values 0..255). */
function relativeLuminance(r: number, g: number, b: number): number {
  const linearise = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG contrast ratio between two hex colors. */
function contrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Parse globals.css token values
// ---------------------------------------------------------------------------

const globalsPath = path.resolve(
  __dirname,
  '../../src/renderer/globals.css',
);
const globalsCss = readFileSync(globalsPath, 'utf-8');

/**
 * Extract the first hex value for a CSS custom property name from globals.css.
 * Matches lines like:  --foo: #aabbcc;
 */
function extractToken(name: string): string {
  const re = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`, 'm');
  const match = globalsCss.match(re);
  if (!match) throw new Error(`Token ${name} not found in globals.css`);
  return match[1];
}

// ---------------------------------------------------------------------------
// 1. Card smoke test
// ---------------------------------------------------------------------------

describe('Card primitive', () => {
  it('imports and mounts without throwing', async () => {
    const {
      Card,
      CardHeader,
      CardTitle,
      CardContent,
      CardFooter,
    } = await import('@/components/ui/card');

    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Test title</CardTitle>
        </CardHeader>
        <CardContent>Content here</CardContent>
        <CardFooter>Footer text</CardFooter>
      </Card>,
    );

    expect(container.firstChild).toBeTruthy();
    const card = container.querySelector('[data-slot="card"]');
    expect(card).toBeTruthy();
  });

  it('CardDescription imports and mounts', async () => {
    const { Card, CardDescription } = await import('@/components/ui/card');
    const { container } = render(
      <Card>
        <CardDescription>A description</CardDescription>
      </Card>,
    );
    expect(container.firstChild).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Skeleton smoke test
// ---------------------------------------------------------------------------

describe('Skeleton primitive', () => {
  it('imports and mounts without throwing', async () => {
    const { Skeleton } = await import('@/components/ui/skeleton');
    const { container } = render(<Skeleton className="h-4 w-full" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('applies animate-pulse class', async () => {
    const { Skeleton } = await import('@/components/ui/skeleton');
    const { container } = render(<Skeleton data-testid="skel" />);
    const el = container.firstChild as HTMLElement;
    // The component uses animate-pulse for the loading shimmer
    expect(el.className).toContain('animate-pulse');
  });
});

// ---------------------------------------------------------------------------
// 3. Token distinctness: --age-orange vs --attention
// ---------------------------------------------------------------------------

describe('CSS token: --age-orange distinct from --attention', () => {
  it('--age-orange is defined in globals.css', () => {
    const token = extractToken('--age-orange');
    expect(token).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('--attention is defined in globals.css', () => {
    const token = extractToken('--attention');
    expect(token).toBe('#ce9178');
  });

  it('--age-orange and --attention are different hex values', () => {
    const ageOrange = extractToken('--age-orange');
    const attention = extractToken('--attention');
    expect(ageOrange.toLowerCase()).not.toBe(attention.toLowerCase());
  });

  it('--color-age-orange is registered in @theme inline', () => {
    expect(globalsCss).toContain('--color-age-orange');
  });
});

// ---------------------------------------------------------------------------
// 4. Token: --attention-foreground is dark and meets AA vs --attention
// ---------------------------------------------------------------------------

describe('CSS token: --attention-foreground', () => {
  it('--attention-foreground is defined in globals.css', () => {
    const token = extractToken('--attention-foreground');
    expect(token).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('--attention-foreground is a dark color (luminance < 0.1)', () => {
    const fg = extractToken('--attention-foreground');
    const [r, g, b] = hexToRgb(fg);
    const lum = relativeLuminance(r, g, b);
    expect(lum).toBeLessThan(0.1);
  });

  it('--attention-foreground meets AA contrast (>=4.5:1) against --attention', () => {
    const fg = extractToken('--attention-foreground');
    const bg = extractToken('--attention');
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('--color-attention-foreground is registered in @theme inline', () => {
    expect(globalsCss).toContain('--color-attention-foreground');
  });
});

// ---------------------------------------------------------------------------
// 5. Token: --age-orange clears AA vs --background
// ---------------------------------------------------------------------------

describe('CSS token: text-age-orange AA vs background', () => {
  it('--background is defined in globals.css', () => {
    const token = extractToken('--background');
    expect(token).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('--age-orange clears AA contrast (>=4.5:1) against --background', () => {
    const fg = extractToken('--age-orange');
    const bg = extractToken('--background');
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

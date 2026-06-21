import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabIndicator from '../../src/renderer/components/TabIndicator';

describe('TabIndicator', () => {
  it('renders a static icon for new status', () => {
    const { container } = render(<TabIndicator status="new" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(container.firstElementChild).toHaveClass('inline-flex');
  });

  it('renders a static icon for shell status', () => {
    const { container } = render(<TabIndicator status="shell" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(container.firstElementChild).toHaveClass('inline-flex');
  });

  it('renders a spinning icon for working status', () => {
    const { container } = render(<TabIndicator status="working" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(container.firstElementChild).toHaveClass('inline-flex', 'motion-safe:animate-spin');
  });

  it('renders a static icon for idle status', () => {
    const { container } = render(<TabIndicator status="idle" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(container.firstElementChild).toHaveClass('inline-flex');
    expect(container.firstElementChild).not.toHaveClass('motion-safe:animate-spin');
    expect(container.firstElementChild).not.toHaveClass('animate-spin');
  });

  it('renders a pulsing icon for requires_response status', () => {
    const { container } = render(<TabIndicator status="requires_response" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(container.firstElementChild).toHaveClass('inline-flex', 'motion-safe:animate-pulse');
  });
});

describe('TabIndicator reduced-motion', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('working glyph carries motion-safe:animate-spin, no bare animate-spin', () => {
    const { container } = render(<TabIndicator status="working" />);
    const el = container.firstElementChild;
    expect(el).toHaveClass('motion-safe:animate-spin');
    expect(el).not.toHaveClass('animate-spin');
  });

  it('requires_response glyph carries motion-safe:animate-pulse, no bare animate-pulse', () => {
    const { container } = render(<TabIndicator status="requires_response" />);
    const el = container.firstElementChild;
    expect(el).toHaveClass('motion-safe:animate-pulse');
    expect(el).not.toHaveClass('animate-pulse');
  });
});

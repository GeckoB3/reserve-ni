/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { isFullscreenApiSupported } from './fullscreen';

describe('fullscreen', () => {
  it('reports unsupported when requestFullscreen is missing', () => {
    const original = document.documentElement.requestFullscreen;
    // @ts-expect-error — test stub
    document.documentElement.requestFullscreen = undefined;
    // @ts-expect-error — test stub
    document.documentElement.webkitRequestFullscreen = undefined;
    // @ts-expect-error — test stub
    document.documentElement.msRequestFullscreen = undefined;

    expect(isFullscreenApiSupported()).toBe(false);

    document.documentElement.requestFullscreen = original;
  });
});

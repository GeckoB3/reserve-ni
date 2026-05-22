type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
};

type FullscreenCapableDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
};

/** Whether the browser exposes a document-element fullscreen API (incl. legacy prefixes). */
export function isFullscreenApiSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement as FullscreenCapableElement;
  return Boolean(
    root.requestFullscreen ?? root.webkitRequestFullscreen ?? root.msRequestFullscreen,
  );
}

/** Element currently in fullscreen, if any. */
export function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as FullscreenCapableDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.msFullscreenElement ?? null;
}

export function isDocumentFullscreen(): boolean {
  return getFullscreenElement() !== null;
}

export async function enterDocumentFullscreen(): Promise<void> {
  const root = document.documentElement as FullscreenCapableElement;
  if (root.requestFullscreen) {
    await root.requestFullscreen();
    return;
  }
  if (root.webkitRequestFullscreen) {
    await root.webkitRequestFullscreen();
    return;
  }
  if (root.msRequestFullscreen) {
    await root.msRequestFullscreen();
    return;
  }
  throw new Error('Fullscreen API is not supported');
}

export async function exitDocumentFullscreen(): Promise<void> {
  const doc = document as FullscreenCapableDocument;
  if (doc.exitFullscreen) {
    await doc.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
    return;
  }
  if (doc.msExitFullscreen) {
    await doc.msExitFullscreen();
    return;
  }
  throw new Error('Fullscreen API is not supported');
}

export async function toggleDocumentFullscreen(): Promise<void> {
  if (isDocumentFullscreen()) {
    await exitDocumentFullscreen();
    return;
  }
  await enterDocumentFullscreen();
}

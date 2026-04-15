/**
 * Table label font fitting — shared so all tables on a floor can use one unified size
 * (the minimum size needed by any table for its name/capacity lines).
 */

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function circleHalfChordAtY(radius: number, yFromCentre: number): number {
  const y = Math.min(Math.abs(yFromCentre), radius * 0.999);
  return Math.sqrt(Math.max(0, radius * radius - y * y));
}

function ellipseHalfChordAtY(radiusX: number, radiusY: number, yFromCentre: number): number {
  const y = Math.min(Math.abs(yFromCentre), radiusY * 0.999);
  return radiusX * Math.sqrt(Math.max(0, 1 - (y / radiusY) ** 2));
}

export function computeInnerLabelWidthRounded(args: {
  w: number;
  h: number;
  insetXLocal: number;
  isCircular: boolean;
  isOval: boolean;
  labelHalfHeight: number;
  curveInsetFactor?: number;
}): number {
  const minInner = 14;
  const rectCap = Math.max(minInner, args.w - args.insetXLocal * 2);
  if (!args.isCircular && !args.isOval) {
    return rectCap;
  }

  const curveInset = args.curveInsetFactor ?? 0.96;
  const pad = 1.5;
  const yUse = args.labelHalfHeight + pad;

  let chordHalf: number;
  if (args.isCircular) {
    const r = Math.min(args.w, args.h) / 2 - 0.75;
    chordHalf = circleHalfChordAtY(Math.max(1, r), yUse);
  } else {
    const rX = args.w / 2 - 0.75;
    const rY = args.h / 2 - 0.75;
    chordHalf = ellipseHalfChordAtY(rX, rY, yUse);
  }

  const chordW = Math.max(minInner, 2 * chordHalf * curveInset);
  return Math.min(rectCap, chordW);
}

export interface TableLabelFitInput {
  w: number;
  h: number;
  shape: string;
  topLabel: string;
  bottomLabel: string;
  compactLabels: boolean;
  layoutScale?: number | null;
}

export interface TableLabelFitResult {
  fontName: number;
  fontCap: number;
  gap: number;
}

/** Single-line box height for Konva Text (bold needs extra headroom vs raw fontSize). */
function compactLineBox(fs: number, bold: boolean): number {
  return Math.ceil(fs * (bold ? 1.32 : 1.24)) + 2;
}

/**
 * Per-table shrink loop — must stay in sync with `TableShape` label layout.
 */
export function computeFittedTableLabelFonts(input: TableLabelFitInput): TableLabelFitResult {
  const { w, h, shape, topLabel, bottomLabel, compactLabels, layoutScale } = input;
  const isCircular = shape === 'circle';
  const isOval = shape === 'oval';
  const minDim = Math.min(w, h);
  const topEdge = isCircular ? -Math.min(w, h) / 2 : -h / 2;
  const bottomEdge = isCircular ? Math.min(w, h) / 2 : h / 2;

  const widthNeed = (txt: string, fs: number, bold: boolean) =>
    txt.length * (bold ? fs * 0.56 : fs * 0.52);

  if (compactLabels) {
    const insetXLocal = clamp(w * 0.03, 1, 6);
    const innerH = Math.max(0, bottomEdge - topEdge);

    let fn = Math.round(clamp(minDim * 0.4, 11, 18));
    let fc = Math.round(clamp(minDim * 0.36, 10, 17));
    let gap = 2;

    const measureBlock = (nameFs: number, capFs: number, g: number) => {
      const nh = nameFs + 1;
      const ch = capFs + 1;
      return { blockH: nh + g + ch, nameBox: nh, capBox: ch };
    };

    let { blockH } = measureBlock(fn, fc, gap);
    let computedInnerW = computeInnerLabelWidthRounded({
      w,
      h,
      insetXLocal,
      isCircular,
      isOval,
      labelHalfHeight: blockH / 2,
      curveInsetFactor: 0.97,
    });
    let iter = 0;
    while (iter < 120) {
      const fitsHeight = blockH <= innerH;
      const fitsWidth =
        widthNeed(topLabel, fn, true) <= computedInnerW &&
        widthNeed(bottomLabel, fc, false) <= computedInnerW;
      if (fitsHeight && fitsWidth) break;

      if (gap > 0) gap -= 1;
      else if (fn >= fc && fn > 4) fn -= 1;
      else if (fc > 4) fc -= 1;
      else break;

      ({ blockH } = measureBlock(fn, fc, gap));
      computedInnerW = computeInnerLabelWidthRounded({
        w,
        h,
        insetXLocal,
        isCircular,
        isOval,
        labelHalfHeight: blockH / 2,
        curveInsetFactor: 0.97,
      });
      iter += 1;
    }

    return { fontName: fn, fontCap: fc, gap };
  }

  const insetY = clamp(minDim * 0.032, 2, 6);
  const insetXLocal = clamp(w * 0.032, 2, 7);
  const innerTop = topEdge + insetY;
  const innerBottom = bottomEdge - insetY;
  const innerH = Math.max(0, innerBottom - innerTop);

  const zoomReadabilityBoost =
    layoutScale != null && layoutScale > 0 ? clamp(0.52 / layoutScale, 1, 2.6) : 1;

  let fn = Math.round(clamp(minDim * 0.46, 14, 30) * zoomReadabilityBoost);
  let fc = Math.round(clamp(minDim * 0.4, 12, 26) * zoomReadabilityBoost);
  fn = Math.min(fn, 42);
  fc = Math.min(fc, 36);
  let gap = 2;

  const measureBlock = (nameFs: number, capFs: number, g: number) => {
    const nh = compactLineBox(nameFs, true);
    const ch = compactLineBox(capFs, false);
    return { blockH: nh + g + ch, nameBox: nh, capBox: ch };
  };

  let { blockH } = measureBlock(fn, fc, gap);
  let computedInnerW = computeInnerLabelWidthRounded({
    w,
    h,
    insetXLocal,
    isCircular,
    isOval,
    labelHalfHeight: blockH / 2,
    curveInsetFactor: 0.97,
  });
  let iter = 0;
  while (iter < 140) {
    const fitsHeight = blockH <= innerH;
    const fitsWidth =
      widthNeed(topLabel, fn, true) <= computedInnerW &&
      widthNeed(bottomLabel, fc, false) <= computedInnerW;
    if (fitsHeight && fitsWidth) break;

    if (gap > 0) gap -= 1;
    else if (fn >= fc && fn > 7) fn -= 1;
    else if (fc > 7) fc -= 1;
    else break;

    ({ blockH } = measureBlock(fn, fc, gap));
    computedInnerW = computeInnerLabelWidthRounded({
      w,
      h,
      insetXLocal,
      isCircular,
      isOval,
      labelHalfHeight: blockH / 2,
      curveInsetFactor: 0.97,
    });
    iter += 1;
  }

  return { fontName: fn, fontCap: fc, gap };
}

/** Minimum font sizes across all tables so labels look consistent on one floor. */
export function computeGlobalUnifiedLabelFonts(
  inputs: TableLabelFitInput[],
): TableLabelFitResult | null {
  if (inputs.length === 0) return null;
  const fits = inputs.map(computeFittedTableLabelFonts);
  return {
    fontName: Math.min(...fits.map((f) => f.fontName)),
    fontCap: Math.min(...fits.map((f) => f.fontCap)),
    gap: Math.min(...fits.map((f) => f.gap)),
  };
}

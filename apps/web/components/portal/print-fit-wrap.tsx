"use client";

/**
 * Mobile-fit wrapper for fixed-width print components (A4 = 794px).
 *
 * On wider viewports it renders the child at native scale. On narrow
 * viewports it shrinks the child via CSS transform so the whole sheet
 * fits horizontally — no awkward sideways scrolling. A ResizeObserver
 * watches both the available width and the child's height so the
 * compensating wrapper height stays accurate (transform alone doesn't
 * change layout flow, so we set the outer height manually).
 *
 * The text becomes smaller when scaled; the user can pinch-zoom for
 * detail or tap Download PDF for the proper full-size file.
 */

import { ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  children: ReactNode;
  /** Native width of the child. Defaults to A4 portrait at 96dpi. */
  baseWidth?: number;
  /** Native height fallback to reserve before the child has measured. */
  baseHeight?: number;
  /** Horizontal breathing room subtracted from the viewport. */
  horizontalPadding?: number;
}

export function PrintFitWrap({
  children,
  baseWidth = 794,
  baseHeight = 1123,
  horizontalPadding = 0,
}: Props) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const recompute = () => {
      const available = Math.max(0, outer.clientWidth - horizontalPadding);
      // If outer hasn't laid out yet (clientWidth === 0 in a hidden
      // container) keep scale = 1 so the next paint measures correctly.
      const next = available > 0 ? Math.min(1, available / baseWidth) : 1;
      setScale(next);
      // Fall back to the A4 baseHeight when scrollHeight is still 0
      // (first mount, before child paints) so the wrapper reserves
      // space instead of collapsing to zero and getting locked there.
      const measured = inner.scrollHeight > 0 ? inner.scrollHeight : baseHeight;
      setHeight(measured * next);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [baseWidth, baseHeight, horizontalPadding]);

  return (
    <div
      ref={outerRef}
      style={{
        width: "100%",
        // Reserve the scaled A4 height even before measurement so the
        // print sheet doesn't briefly collapse to 0px on mount.
        height: height ?? baseHeight,
        overflow: "hidden",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: `${baseWidth}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

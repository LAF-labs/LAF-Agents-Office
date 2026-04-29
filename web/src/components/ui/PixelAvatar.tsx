import { useEffect, useRef } from "react";

interface PixelAvatarProps {
  slug: string;
  size: number;
  className?: string;
}

/**
 * Renders a pixel-art agent portrait on a <canvas>.
 * Pass a className like `pixel-avatar-sidebar` or `pixel-avatar-panel`
 * to apply theme-level sizing/treatment around the canvas.
 */
export function PixelAvatar({ slug, size, className }: PixelAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    import("../../lib/pixelAvatar")
      .then(({ drawPixelAvatar }) => {
        if (cancelled || canvasRef.current !== canvas) return;
        drawPixelAvatar(canvas, slug, size);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, size]);

  const composedClassName = ["pixel-avatar", className]
    .filter(Boolean)
    .join(" ");

  return (
    <canvas
      ref={canvasRef}
      className={composedClassName}
      style={{ width: size, height: size }}
    />
  );
}

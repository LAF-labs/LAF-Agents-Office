// Office-sheet avatar portraits for built-in agents, with procedural fallback
// for any dynamic or unknown slugs that do not have a mapped character yet.

import { resolveKnownPortraitSprite } from "./avatarSprites.generated";
import { buildProceduralSprite, getProceduralAccent } from "./proceduralAvatar";

const AGENT_COLORS: Record<string, string> = {
  ceo: "#c78a1f",
  eng: "#6a8b52",
  gtm: "#c78a1f",
  human: "#274472",
  pm: "#274472",
  fe: "#274472",
  frontend: "#274472",
  be: "#6a8b52",
  backend: "#6a8b52",
  ai: "#b43a2f",
  "ai-eng": "#b43a2f",
  ai_eng: "#b43a2f",
  designer: "#b43a2f",
  cmo: "#c78a1f",
  cro: "#1264a3",
  pam: "#b43a2f",
  nex: "#c78a1f",
};

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function paletteFromHexes(palette: string[]): Record<number, Rgb> {
  return Object.fromEntries(
    palette.map((hex, index) => [index + 1, hexToRgb(hex)]),
  );
}

export function getAgentColor(slug: string): string {
  return AGENT_COLORS[slug] ?? getProceduralAccent(slug);
}

/**
 * Paint a pixel-art agent avatar into an existing canvas element.
 * Known agents render from the generated avatar catalog; everything else keeps
 * the deterministic procedural fallback.
 */
export function drawPixelAvatar(
  canvas: HTMLCanvasElement,
  slug: string,
  size: number,
): void {
  const known = resolveKnownPortraitSprite(slug);
  const procedural = known ? null : buildProceduralSprite(slug);

  const sprite = known?.portrait ?? procedural?.grid ?? [];
  const palette = known
    ? paletteFromHexes(known.palette)
    : (procedural?.palette ?? {});

  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return;

  canvas.width = cols;
  canvas.height = rows;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${(size * rows) / cols}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const imgData = ctx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = sprite[r][c];
      const idx = (r * cols + c) * 4;
      if (px === 0) {
        imgData.data[idx] = 0;
        imgData.data[idx + 1] = 0;
        imgData.data[idx + 2] = 0;
        imgData.data[idx + 3] = 0;
        continue;
      }

      const rgb = palette[px] ?? ([128, 128, 128] as const);
      imgData.data[idx] = rgb[0];
      imgData.data[idx + 1] = rgb[1];
      imgData.data[idx + 2] = rgb[2];
      imgData.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

import sharp from "sharp";
import type { Palette } from "./palette";

/**
 * Picks two colours from an album cover and turns them into a palette.
 *
 * Done on the server, once, and stored with the album copy: the browser cannot
 * read pixels of an image from another origin without that origin's consent,
 * and doing it here means every visitor sees the same colours with no flash of
 * the default ones first.
 *
 * The cover is shrunk to 32×32 and each pixel votes for its hue, weighted by
 * how colourful it is — a grey or near-black pixel says nothing about the
 * cover's colour, and a plain average of a mostly-white cover would be beige.
 * The second colour is the strongest hue at least 45° from the first.
 */
const BINS = 24;

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

export async function paletteFromImage(url: string): Promise<Palette | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(32, 32, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const weight = new Array<number>(BINS).fill(0);
  const sat = new Array<number>(BINS).fill(0);
  for (let i = 0; i < data.length; i += info.channels) {
    const [h, s, l] = toHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.18 || l < 0.1 || l > 0.92) continue; // grey, black and white carry no hue
    const w = s * (1 - Math.abs(2 * l - 1));
    const bin = Math.floor(h / (360 / BINS)) % BINS;
    weight[bin] += w;
    sat[bin] += w * s;
  }

  const order = weight.map((w, i) => i).sort((a, b) => weight[b] - weight[a]);
  const first = order[0];
  if (weight[first] <= 0) {
    // a grey cover: keep it neutral instead of inventing a colour
    return { bg: "hsl(0 0% 24%)", bgDeep: "hsl(0 0% 12%)", disc: "hsl(0 0% 62%)" };
  }
  const hueOf = (bin: number) => (bin + 0.5) * (360 / BINS);
  const apart = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
  };
  const second = order.find((b) => weight[b] > weight[first] * 0.15 && apart(hueOf(b), hueOf(first)) >= 45);
  const h1 = hueOf(first);
  const s1 = sat[first] / weight[first];
  const h2 = second !== undefined ? hueOf(second) : (h1 + 35) % 360;
  const s2 = second !== undefined ? sat[second] / weight[second] : s1;

  return {
    bg: hsl(h1, clamp(s1, 0.4, 0.8), 0.32),
    bgDeep: hsl(h1, clamp(s1, 0.4, 0.8), 0.16),
    disc: hsl(h2, clamp(s2, 0.45, 0.85), 0.56),
  };
}

"use client";

/** A stable colour from text, for artwork the browser may not read (no CORS) or no artwork at all. */
export function moodFromText(text: string): string {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 55% 55%)`;
}

const cache = new Map<string, Promise<string | null>>();

/**
 * The average colour of an artwork image, sampled on an 8×8 canvas. Null when the image host does
 * not allow cross-origin reads (the canvas would be tainted) or the image fails to load.
 */
export function moodFromArtwork(url: string): Promise<string | null> {
  const known = cache.get(url);
  if (known) return known;
  const sampled = new Promise<string | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, 8, 8);
        const { data } = context.getImageData(0, 0, 8, 8);
        let [r, g, b] = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) {
          r += data[i] ?? 0;
          g += data[i + 1] ?? 0;
          b += data[i + 2] ?? 0;
        }
        const n = data.length / 4;
        resolve(`rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
  cache.set(url, sampled);
  return sampled;
}

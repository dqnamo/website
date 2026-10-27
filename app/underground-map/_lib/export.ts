import { mapFont } from "./fonts";
import { THEMES } from "./render";
import type { MapDoc, MapStyle } from "./types";

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "tube-map";

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function exportSvg(svg: SVGSVGElement, doc: MapDoc, style: MapStyle) {
  const graphics = svg.querySelector<SVGGElement>("#map-graphics");
  const labels = svg.querySelector<SVGGElement>("#map-labels");
  if (!graphics) return false;
  const boxes = [graphics.getBBox(), labels?.getBBox()].filter(
    (b): b is DOMRect => !!b && b.width > 0,
  );
  if (!boxes.length) return false;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));

  const pad = 56;
  const titleH = 56;
  const x = minX - pad;
  const y = minY - pad - titleH;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2 + titleH;
  const theme = THEMES[style.theme];

  const strip = (el: Element) => {
    const clone = el.cloneNode(true) as Element;
    for (const n of clone.querySelectorAll("[class], [style], [data-label]")) {
      n.removeAttribute("class");
      n.removeAttribute("style");
      n.removeAttribute("data-label");
      n.removeAttribute("pathLength");
    }
    // On the page the labels use next/font's private family name; the file gets the real one.
    return clone.outerHTML.replaceAll(
      mapFont.style.fontFamily,
      "'Hammersmith One', sans-serif",
    );
  };

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}">`,
    `<style>@import url('https://fonts.googleapis.com/css2?family=Hammersmith+One&amp;display=swap');</style>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.bg}"/>`,
    `<text x="${minX}" y="${minY - pad + 8}" font-family="'Hammersmith One', sans-serif" font-size="28" fill="${theme.label}">${escapeXml(doc.title)}</text>`,
    strip(graphics),
    labels ? strip(labels) : "",
    "</svg>",
  ].join("");

  download(
    `${slug(doc.title)}.svg`,
    new Blob([out], { type: "image/svg+xml" }),
  );
  return true;
}

export function exportJson(doc: MapDoc, style: MapStyle) {
  const data = JSON.stringify(
    { app: "underground-map", version: 1, doc, style },
    null,
    2,
  );
  download(
    `${slug(doc.title)}.json`,
    new Blob([data], { type: "application/json" }),
  );
}

export async function readJson(
  file: File,
): Promise<{ doc: MapDoc; style?: MapStyle }> {
  const data = JSON.parse(await file.text());
  const doc = data.doc ?? data;
  if (
    !Array.isArray(doc.stations) ||
    !Array.isArray(doc.lines) ||
    !Array.isArray(doc.segments)
  ) {
    throw new Error("That file doesn't look like a tube map.");
  }
  return { doc: { title: "Untitled", routes: {}, ...doc }, style: data.style };
}

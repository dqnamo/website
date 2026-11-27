// The lettering on things, drawn once on a 2D canvas and handed to the shaders as a texture: the
// engraving on the front of the pull and the size stamped on its back, the care label sewn in
// the pocket and a ticket stub someone left there. Four columns, each 256 by 640 pixels,
// standing for a rectangle of the sizes below.

import type { FabricSpec } from "./parts";

export const ATLAS_WIDTH = 1024;
export const ATLAS_HEIGHT = 640;

// Millimetres each column covers.
export const ENGRAVING = { width: 9, height: 22.5 };
export const LABEL = { width: 22, height: 55 };
export const TICKET = { width: 24, height: 60 };

function cssFont(variable: string, fallback: string) {
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return family ? `${family}, ${fallback}` : fallback;
}

export function fontsFor() {
  return {
    mark: cssFont("--font-pirata-one", "serif"),
    text: cssFont("--font-inter", "system-ui, sans-serif"),
  };
}

// A wash tub, a triangle, an iron, a square with a circle and a circle: the usual row of care
// symbols, crossed out or not.
function careSymbols(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  crossed: boolean[],
) {
  g.save();
  g.lineWidth = size * 0.09;
  g.lineJoin = "round";
  g.lineCap = "round";
  const step = size * 1.25;
  const draw = [
    () => {
      g.beginPath();
      g.moveTo(-0.5, -0.25);
      g.lineTo(-0.38, 0.38);
      g.lineTo(0.38, 0.38);
      g.lineTo(0.5, -0.25);
      g.moveTo(-0.44, -0.05);
      g.quadraticCurveTo(-0.22, -0.2, 0, -0.05);
      g.quadraticCurveTo(0.22, 0.1, 0.44, -0.05);
      g.stroke();
    },
    () => {
      g.beginPath();
      g.moveTo(0, -0.42);
      g.lineTo(0.48, 0.38);
      g.lineTo(-0.48, 0.38);
      g.closePath();
      g.stroke();
    },
    () => {
      g.beginPath();
      g.moveTo(-0.5, 0.32);
      g.lineTo(0.5, 0.32);
      g.lineTo(0.42, -0.08);
      g.quadraticCurveTo(0.3, -0.3, 0, -0.3);
      g.lineTo(-0.2, -0.3);
      g.quadraticCurveTo(-0.45, -0.1, -0.5, 0.32);
      g.stroke();
    },
    () => {
      g.beginPath();
      g.rect(-0.42, -0.42, 0.84, 0.84);
      g.moveTo(0.3, 0);
      g.arc(0, 0, 0.3, 0, Math.PI * 2);
      g.stroke();
    },
    () => {
      g.beginPath();
      g.arc(0, 0, 0.42, 0, Math.PI * 2);
      g.stroke();
    },
  ];
  draw.forEach((symbol, i) => {
    g.save();
    g.translate(x + i * step, y);
    g.scale(size, size);
    g.lineWidth = 0.09;
    symbol();
    if (crossed[i]) {
      g.beginPath();
      g.moveTo(-0.5, -0.45);
      g.lineTo(0.5, 0.45);
      g.moveTo(0.5, -0.45);
      g.lineTo(-0.5, 0.45);
      g.stroke();
    }
    g.restore();
  });
  g.restore();
}

export function drawAtlas(canvas: HTMLCanvasElement, fabric: FabricSpec) {
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const g = canvas.getContext("2d");
  if (!g) return;
  const { mark, text } = fontsFor();
  g.fillStyle = "#000";
  g.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  const pxmm = 256 / ENGRAVING.width;

  // The front of the pull: the wordmark cut along its length, in an engraved frame.
  g.save();
  g.fillStyle = "#f00";
  g.strokeStyle = "#f00";
  g.translate(128, 320);
  g.rotate(Math.PI / 2);
  g.font = `${Math.round(pxmm * 4.6)}px ${mark}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("dqnamo", 0, pxmm * 0.25);
  g.lineWidth = pxmm * 0.28;
  g.beginPath();
  g.roundRect(-pxmm * 9.6, -pxmm * 3.05, pxmm * 19.2, pxmm * 6.1, pxmm * 2.8);
  g.stroke();
  g.restore();

  // The back, seen when the pull is flipped up, so drawn upside down: the size, stamped.
  g.save();
  g.fillStyle = "#f00";
  g.translate(384, 320);
  g.rotate(Math.PI);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${Math.round(pxmm * 2.1)}px ${text}`;
  g.fillText("No", 0, -pxmm * 3.6);
  g.font = `700 ${Math.round(pxmm * 6.2)}px ${text}`;
  g.fillText("5", 0, pxmm * 0.6);
  g.beginPath();
  for (let i = -1; i <= 1; i++) {
    g.moveTo(i * pxmm * 1.4 + pxmm * 0.35, pxmm * 5.4);
    g.arc(i * pxmm * 1.4, pxmm * 5.4, pxmm * 0.35, 0, Math.PI * 2);
  }
  g.fill();
  g.restore();

  // The care label: woven ink in red, the label itself in blue.
  const lab = 256 / LABEL.width;
  g.save();
  g.translate(512, 0);
  g.fillStyle = "#00f";
  g.fillRect(0, 0, 256, 640);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "#f00";
  g.strokeStyle = "#f00";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = `${Math.round(lab * 6.4)}px ${mark}`;
  g.fillText("dqnamo", 128, lab * 13);
  g.font = `600 ${Math.round(lab * 2.2)}px ${text}`;
  g.fillText(fabric.label1.toUpperCase(), 128, lab * 20);
  g.font = `${Math.round(lab * 1.9)}px ${text}`;
  fabric.label2.forEach((line, i) => {
    g.fillText(line, 128, lab * (25 + i * 2.8));
  });
  careSymbols(
    g,
    128 - lab * 2.5 * 2,
    lab * 38,
    lab * 2,
    fabric.value === "waxed"
      ? [true, true, true, true, true]
      : fabric.value === "ripstop"
        ? [false, true, true, true, false]
        : [false, true, false, true, false],
  );
  g.font = `${Math.round(lab * 1.5)}px ${text}`;
  g.fillText("Made with care", 128, lab * 45);
  g.restore();

  // The ticket: card in blue, a torn perforated top, red and black ink.
  const tix = 256 / TICKET.width;
  g.save();
  g.translate(768, 0);
  g.fillStyle = "#00f";
  g.beginPath();
  g.roundRect(0, tix * 1.2, 256, 640 - tix * 1.2, tix * 0.8);
  g.fill();
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i <= 12; i++) {
    g.beginPath();
    g.arc((i / 12) * 256, tix * 1.2, tix * 0.62, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "#f00";
  g.lineWidth = tix * 0.35;
  g.beginPath();
  g.roundRect(tix * 1.8, tix * 4, 256 - tix * 3.6, 640 - tix * 6, tix * 1.2);
  g.stroke();
  g.fillStyle = "#f00";
  g.save();
  g.translate(128, 320);
  g.rotate(-Math.PI / 2);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `800 ${Math.round(tix * 7.6)}px ${text}`;
  g.fillText("ADMIT ONE", 0, -tix * 1.4);
  g.restore();
  g.fillStyle = "#0f0";
  g.textAlign = "center";
  g.font = `600 ${Math.round(tix * 2)}px ${text}`;
  g.fillText("No 000512", 128, 640 - tix * 4.6);
  g.save();
  g.translate(128 + tix * 7.4, 320);
  g.rotate(-Math.PI / 2);
  g.font = `${Math.round(tix * 2.6)}px ${mark}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("dqnamo", 0, 0);
  g.restore();
  g.restore();
}

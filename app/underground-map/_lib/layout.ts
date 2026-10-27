/** The sidebar floats over the canvas: this wide, and this far in from the screen's edges. */
export const PANEL_WIDTH = 310;
export const PANEL_GAP = 12;

/**
 * How much of the canvas's right side the sidebar covers, so the map and its overlays centre in
 * what's left. On a narrow screen it covers too much to work around, so the whole canvas counts.
 */
export function panelCover(canvasWidth: number) {
  const cover = PANEL_WIDTH + PANEL_GAP * 2;
  return canvasWidth > cover * 2 ? cover : 0;
}

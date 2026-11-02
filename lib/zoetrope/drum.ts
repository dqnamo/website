// The zoetrope's measurements, in millimetres, shared by the engine, the shader and the strips.
// The drum is a Victorian twelve-inch one: a tinplate wall round a card floor, with a ring of
// slits in its upper half and the picture strip standing against the inside of its lower half.
// It sits on a turned wooden spindle on the table.

export const DRUM = {
  // Outside radius of the wall, and inside it once the tin's thickness is taken off. The
  // thickness matters at the sides, where the slits are seen at a slant and close up.
  radius: 150,
  inner: 148.6,
  // From the floor of the drum to the rolled rim.
  height: 196,
  // The band the slits are cut in.
  slitLow: 100,
  slitHigh: 186,
  slits: 12,
  // The band the picture strip covers, standing on the floor.
  stripLow: 6,
  stripHigh: 84,
  // The turned stand: a collar under the drum, a column and a round foot on the table.
  collar: 26,
  collarLow: -16,
  column: 14,
  foot: 84,
  footTop: -138,
  table: -160,
  // The back wall of the room.
  wall: -950,
} as const;

// The strip's length is the inside circumference, so a texture of this many texels round wraps
// exactly once.
export const STRIP_TEXELS = 4096;
export const STRIP_ROWS = Math.round(
  (STRIP_TEXELS * (DRUM.stripHigh - DRUM.stripLow)) /
    (2 * Math.PI * DRUM.inner),
);

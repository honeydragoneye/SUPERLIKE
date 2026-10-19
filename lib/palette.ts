/** Colours taken from an album cover, ready to paint a block with. All CSS colours. */
export type Palette = {
  /** the block's background: dark enough for cream text */
  bg: string;
  /** a darker step of the same hue, for the far corner of a gradient */
  bgDeep: string;
  /** the record's surface */
  disc: string;
};

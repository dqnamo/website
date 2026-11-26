export const experiments = [
  {
    title: "Tactile Button",
    href: "/experiments/tactile-button",
    added: "2026-08-13",
    description:
      "A physical button study built from a shaped face, firm edge, and compressible depth.",
    preview: "tactile-button",
  },
  {
    title: "Receipt Printer",
    href: "/experiments/receipt-printer",
    added: "2026-08-13",
    description:
      "A SaaS checkout state that prints a physical receipt when payment clears.",
    preview: "receipt-printer",
  },
  {
    title: "Cassette Audio Player",
    href: "/experiments/cassette-player",
    added: "2026-08-05",
    description:
      "A tactile audio player with turning reels and a compact-cassette control surface.",
    preview: "cassette-player",
  },
  {
    title: "Hold to Confirm",
    href: "/experiments/hold-to-confirm",
    added: "2026-07-15",
    description:
      "A deliberate action that fills while held, then offers a timed undo.",
    preview: "hold-to-confirm",
  },
  {
    title: "Magnetic Drop Zone",
    href: "/experiments/magnetic-drop-zone",
    added: "2026-07-15",
    description:
      "A file target that pulls toward an incoming drag before the file lands.",
    preview: "magnetic-drop-zone",
  },
  {
    title: "Dynamic Button",
    href: "/experiments/dynamic-button",
    added: "2026-06-21",
    description: "A button that smoothly resizes as its label animates.",
    preview: "dynamic-button",
  },
  {
    title: "Playing Cards",
    href: "/experiments/playing-cards",
    added: "2026-07-06",
    description:
      "A composable playing card, plus a fanned hand you can thumb through and play.",
    preview: "playing-cards",
  },
  {
    title: "Ticket",
    href: "/experiments/ticket",
    added: "2026-07-27",
    description:
      "A perforated ticket silhouette with composable sections and subtle parallax depth.",
    preview: "ticket",
  },
  {
    title: "Stamp",
    href: "/experiments/stamp",
    added: "2026-07-27",
    description:
      "A reusable postage stamp frame for images, text, and custom React content.",
    preview: "stamp",
  },
  {
    title: "Scroll Fade List",
    href: "/experiments/scroll-fade-list",
    added: "2026-06-29",
    description: "A compact list surface with a soft overflow fade.",
    preview: "scroll-fade-list",
  },
  {
    title: "Advanced Model Selector",
    href: "/experiments/model-selector",
    added: "2026-06-29",
    description: "A benchmark-informed picker with model configuration.",
    preview: "model-selector",
  },
  {
    title: "Animated Signature",
    href: "/experiments/signature",
    added: "2026-06-23",
    description:
      "A reusable SVG signature component that draws itself on mount.",
    preview: "signature",
  },
  {
    title: "Logo Trace Loader",
    href: "/experiments/logo-trace-loader",
    added: "2026-06-23",
    description: "A traced logo loader that resolves into a filled mark.",
    preview: "logo-loader",
  },
  {
    title: "Iridescent Foil",
    href: "/experiments/iridescent-foil",
    added: "2026-06-18",
    description:
      "A layered CSS foil treatment that reacts to scroll and pointer.",
    preview: "foil",
  },
  {
    title: "Detent Knob",
    href: "/experiments/detent-knob",
    added: "2026-11-23",
    description:
      "A hi-fi volume knob that hangs on to each notch, then clicks into the next.",
    preview: "detent-knob",
  },
  {
    title: "Toaster",
    href: "/experiments/toaster",
    added: "2026-11-25",
    description:
      "A pop-up toaster whose lever fights back until it catches, then throws the toast up when it's done.",
    preview: "toaster",
  },
] as const;

// Scramble Text has a custom card in the grid rather than an ExperimentPreview.
export const experimentCount = experiments.length + 1;

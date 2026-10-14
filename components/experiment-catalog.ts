const experimentCatalog = [
  {
    title: "Paper Burn",
    href: "/experiments/paper-burn",
    description:
      "An arbitrary div burns away through an irregular flame edge, embers, and ash.",
    hidden: true,
    preview: "paper-burn",
  },
  {
    title: "Tactile Button",
    href: "/experiments/tactile-button",
    description:
      "A physical button study built from a shaped face, firm edge, and compressible depth.",
    preview: "tactile-button",
  },
  {
    title: "Receipt Printer",
    href: "/experiments/receipt-printer",
    description:
      "A SaaS checkout state that prints a physical receipt when payment clears.",
    preview: "receipt-printer",
  },
  {
    title: "Cassette Audio Player",
    href: "/experiments/cassette-player",
    description:
      "A tactile audio player with turning reels and a compact-cassette control surface.",
    preview: "cassette-player",
  },
  {
    title: "Hold to Confirm",
    href: "/experiments/hold-to-confirm",
    description:
      "A deliberate action that fills while held, then offers a timed undo.",
    preview: "hold-to-confirm",
  },
  {
    title: "Magnetic Drop Zone",
    href: "/experiments/magnetic-drop-zone",
    description:
      "A file target that pulls toward an incoming drag before the file lands.",
    preview: "magnetic-drop-zone",
  },
  {
    title: "Dynamic Button",
    href: "/experiments/dynamic-button",
    description: "A button that smoothly resizes as its label animates.",
    preview: "dynamic-button",
  },
  {
    title: "Playing Cards",
    href: "/experiments/playing-cards",
    description:
      "A composable playing card, plus a fanned hand you can thumb through and play.",
    preview: "playing-cards",
  },
  {
    title: "Ticket",
    href: "/experiments/ticket",
    description:
      "A perforated ticket silhouette with composable sections and subtle parallax depth.",
    preview: "ticket",
  },
  {
    title: "Golden Ticket",
    href: "/experiments/golden-ticket",
    description:
      "A luxurious special invitation with embossed details and gold foil that shifts as it tilts.",
    preview: "golden-ticket",
  },
  {
    title: "Waitlist Ticket",
    href: "/experiments/waitlist-ticket",
    description:
      "A Three.js gold-foil invitation with physical tilt and shader-driven disintegration.",
    preview: "waitlist-ticket",
  },
  {
    title: "Stamp",
    href: "/experiments/stamp",
    description:
      "A reusable postage stamp frame for images, text, and custom React content.",
    preview: "stamp",
  },
  {
    title: "Scroll Fade List",
    href: "/experiments/scroll-fade-list",
    description: "A compact list surface with a soft overflow fade.",
    preview: "scroll-fade-list",
  },
  {
    title: "Advanced Model Selector",
    href: "/experiments/model-selector",
    description: "A benchmark-informed picker with model configuration.",
    preview: "model-selector",
  },
  {
    title: "Animated Signature",
    href: "/experiments/signature",
    description:
      "A reusable SVG signature component that draws itself on mount.",
    preview: "signature",
  },
  {
    title: "Logo Trace Loader",
    href: "/experiments/logo-trace-loader",
    description: "A traced logo loader that resolves into a filled mark.",
    preview: "logo-loader",
  },
  {
    title: "Iridescent Foil",
    href: "/experiments/iridescent-foil",
    description:
      "A layered CSS foil treatment that reacts to scroll and pointer.",
    preview: "foil",
  },
] as const;

export const experiments = experimentCatalog.filter(
  (experiment) => !("hidden" in experiment && experiment.hidden),
);

// Scramble Text has a custom card in the grid rather than an ExperimentPreview.
export const experimentCount = experiments.length + 1;

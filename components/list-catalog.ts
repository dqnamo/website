export type ListLogo =
  | {
      alt: string;
      invertInDark?: boolean;
      invertInLight?: boolean;
      src: string;
      type: "image";
    }
  | {
      font: "funnel" | "mono";
      text: string;
      type: "wordmark";
    };

export const listTags = ["Free", "Dev tools", "Mac apps"] as const;

export type ListTag = (typeof listTags)[number];

export type ListItem = {
  description: string;
  href: string;
  logo: ListLogo;
  name: string;
  tags: ListTag[];
  title: string;
};

export const listItems: ListItem[] = [
  {
    description: "Realtime backend you can query from the client.",
    href: "https://www.instantdb.com",
    logo: {
      alt: "Instant",
      invertInDark: true,
      src: "/logos/instantdb.svg",
      type: "image",
    },
    name: "Instant",
    tags: ["Free", "Dev tools"],
    title: "Hosted backend / DB",
  },
  {
    description: "Managed Postgres that stays out of the way.",
    href: "https://planetscale.com",
    logo: {
      alt: "PlanetScale",
      invertInDark: true,
      src: "/logos/planetscale.svg",
      type: "image",
    },
    name: "PlanetScale",
    tags: ["Dev tools"],
    title: "Managed postgres",
  },
  {
    description: "Full Linux VMs for agents, billed by the second.",
    href: "https://box.ascii.dev/",
    logo: {
      font: "funnel",
      text: "box",
      type: "wordmark",
    },
    name: "Box",
    tags: ["Dev tools"],
    title: "Sandbox provider",
  },
  {
    description: "Faster than Spotlight, and it actually does things.",
    href: "https://www.raycast.com",
    logo: {
      alt: "Raycast",
      src: "/logos/raycast.svg",
      type: "image",
    },
    name: "Raycast",
    tags: ["Free", "Mac apps"],
    title: "Spotlight app",
  },
  {
    description: "Local speech-to-text that drops into whatever you are typing.",
    href: "https://handy.computer/",
    logo: {
      alt: "Handy",
      src: "/logos/handy.svg",
      type: "image",
    },
    name: "Handy",
    tags: ["Free", "Mac apps"],
    title: "Speech to text Mac app",
  },
  {
    description: "The harness I use to run coding agents.",
    href: "https://openai.com/codex",
    logo: {
      alt: "Codex",
      invertInLight: true,
      src: "/logos/codex.png",
      type: "image",
    },
    name: "Codex",
    tags: ["Dev tools"],
    title: "Agent harness",
  },
];

export const featuredListItems = listItems.slice(0, 3);
export const listCount = listItems.length;

export function getListItemHref(href: string) {
  const url = new URL(href);
  url.searchParams.set("ref", "dqnamo.com");
  return url.toString();
}

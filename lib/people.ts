/**
 * People mentioned on the site. Write `@id` in a timeline description and
 * it shows up as their name with a little avatar, linked when there's
 * somewhere to send you.
 */
export interface Person {
  /** How they're named in the text, like "Laurence". */
  name: string;
  /** Their full name, shown on hover. */
  fullName?: string;
  /** A square picture under /public/people. Without one, their initials. */
  photo?: string;
  /** LinkedIn, X, a personal site: wherever's best to find them. */
  href?: string;
}

const linkedin = (handle: string) => `https://www.linkedin.com/in/${handle}/`;

export const people = {
  // Startup Weekend, Objective Media
  sainanth: {
    name: "Sainanth",
    fullName: "Sainath Vasantha",
    photo: "/people/sainanth.jpg",
    href: linkedin("sainath-vasantha"),
  },
  laurence: {
    name: "Laurence",
    fullName: "Laurence Mac Donald",
    photo: "/people/laurence.jpg",
    href: linkedin("laurencemd"),
  },
  jamiu: {
    name: "Jamiu",
    fullName: "Jamiu Akanbi",
    photo: "/people/jamiu.jpg",
    href: linkedin("jamiu-akanbi"),
  },

  // Uni, Zedball
  alan: {
    name: "Alan",
    fullName: "Alan Biju",
    photo: "/people/alan.jpg",
    href: linkedin("alanbiju79"),
  },
  lydia: {
    name: "Lydia",
    fullName: "Lydia Thomas K.",
    photo: "/people/lydia.jpg",
    href: linkedin("lydia-t-6a7206183"),
  },
  angela: {
    name: "Angela",
    fullName: "Angela Johnson",
    photo: "/people/angela.jpg",
    href: linkedin("angela-j-146957124"),
  },
  jake: {
    name: "Jake",
    fullName: "Jacob Jose P.",
    photo: "/people/jake.jpg",
    href: linkedin("jacobperia"),
  },
  akhil: {
    name: "Akhil",
    fullName: "Akhil Jacob",
    photo: "/people/akhil.jpg",
    href: linkedin("akhiljacob"),
  },
  ionathan: {
    name: "Ionathan",
    fullName: "Ionatan Sala",
    photo: "/people/ionathan.jpg",
    href: linkedin("ionatansala"),
  },

  // Nurture
  dave: {
    name: "Dave",
    fullName: "David Neville",
    photo: "/people/dave.jpg",
    href: linkedin("dnev"),
  },
  podge: {
    name: "Podge",
    fullName: "Padraic Hogan",
    photo: "/people/podge.jpg",
    href: linkedin("padraichogan"),
  },

  // ThreeDo
  garret: { name: "Garret Flower" },

  // DigitalGenius
  bogdan: {
    name: "Bogdan",
    fullName: "Bogdan Maksak",
    photo: "/people/bogdan.jpg",
    href: linkedin("bogdanmaksak"),
  },

  // London
  harish: {
    name: "Harish",
    fullName: "Harish Malhi",
    photo: "/people/harish.jpg",
    href: linkedin("harishmalhi"),
  },
  marcel: {
    name: "Marcel",
    fullName: "Marcel Hedman",
    photo: "/people/marcel.jpg",
    href: linkedin("marcel-hedman"),
  },
  daniel: {
    name: "Daniel",
    fullName: "Daniel Paul",
    photo: "/people/daniel.jpg",
    href: linkedin("danielpaul94"),
  },
  romil: {
    name: "Romil",
    fullName: "Romil Depala",
    photo: "/people/romil.jpg",
    href: linkedin("romil-depala"),
  },
} satisfies Record<string, Person>;

export type PersonId = keyof typeof people;

export function getPerson(id: string): Person | undefined {
  return Object.hasOwn(people, id) ? people[id as PersonId] : undefined;
}

export function initialsOf(name: string) {
  return name
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

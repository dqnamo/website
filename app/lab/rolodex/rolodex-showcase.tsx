"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  ROLODEX_HEADER_HEIGHT,
  ROLODEX_ROW_HEIGHT,
  Rolodex,
  type RolodexItem,
} from "@/components/Rolodex";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

type Contact = {
  address: string;
  name: string;
  note: string;
  phone: string;
  trade: string;
};

/** Everyone here is made up. The numbers are in Ofcom's range for fiction. */
const contacts: Contact[] = [
  [
    "Ada Brightwater",
    "Lighthouse keeper",
    "0158",
    "Gull Point, Pier Road",
    "Fog horn tested Tuesdays",
  ],
  [
    "Bruno Kettle",
    "Tea blender",
    "0231",
    "4 Steam Lane",
    "Ask for the smoky one",
  ],
  [
    "Clementine Ash",
    "Kiln technician",
    "0307",
    "Unit 9, Brickfield Yard",
    "Fires on the full moon",
  ],
  [
    "Dov Marlowe",
    "Piano tuner",
    "0412",
    "The Old Chapel, Fen St",
    "A440, no exceptions",
  ],
  [
    "Elsie Quarry",
    "Cartographer",
    "0496",
    "Top floor, 12 Meridian Row",
    "Owes me a map of the canal",
  ],
  [
    "Fen Okafor",
    "Beekeeper",
    "0523",
    "Allotment 31, Hive Hill",
    "Honey in September",
  ],
  [
    "Gus Fernhill",
    "Bike courier",
    "0588",
    "Ring, don't knock",
    "Fixed gear, no brakes, no fear",
  ],
  [
    "Hattie Sorrel",
    "Florist",
    "0611",
    "2 Market Arcade",
    "Peonies only in June",
  ],
  [
    "Ines Varga",
    "Type founder",
    "0674",
    "Foundry Mews",
    "Casting a new italic",
  ],
  [
    "Juno Pike",
    "Radio operator",
    "0702",
    "Mast House, Signal Hill",
    "Call sign G4JNO",
  ],
  ["Kit Lambert", "Locksmith", "0745", "Under the arches", "24 hours, mostly"],
  [
    "Lou Ferraro",
    "Pasta maker",
    "0789",
    "17 Flour Street",
    "Tortellini on Fridays",
  ],
  [
    "Mabel Thorne",
    "Bookbinder",
    "0813",
    "Back room, Quire Books",
    "Has my atlas, fixing spine",
  ],
  [
    "Nico Dunmore",
    "Glassblower",
    "0836",
    "Hot Shop, Sand Wharf",
    "Bring the blue jug back",
  ],
  [
    "Otis Wren",
    "Clockmaker",
    "0857",
    "1 Escapement Court",
    "Always four minutes fast",
  ],
  [
    "Pearl Achebe",
    "Sign painter",
    "0872",
    "Studio C, Gilt Yard",
    "Gold leaf for the shop front",
  ],
  [
    "Rafe Calloway",
    "Stagehand",
    "0889",
    "Stage door, the Lyric",
    "Knows every trapdoor",
  ],
  [
    "Sunny Halloran",
    "Ice cream van",
    "0903",
    "Wherever the tune is",
    "Two flakes, always",
  ],
  [
    "Tobias Reed",
    "Sax repair",
    "0917",
    "Basement, 8 Bell Street",
    "New pads, alto",
  ],
  [
    "Ula Brandt",
    "Upholsterer",
    "0928",
    "The Button Works",
    "Green velvet for the chair",
  ],
  [
    "Vera Monk",
    "Night baker",
    "0939",
    "Back door, from 3am",
    "Sourdough starter is called Rex",
  ],
  [
    "Wim de Groot",
    "Window cleaner",
    "0951",
    "Van with the ladder",
    "Second Thursday",
  ],
  [
    "Yara Holm",
    "Yarn dyer",
    "0966",
    "Dye Shed, Mill Lane",
    "Saving me the madder red",
  ],
  [
    "Zeb Antler",
    "Zookeeper",
    "0984",
    "Gate 4, Reptile House",
    "Tortoise is 92, called Gerald",
  ],
].map(([name, trade, phone, address, note]) => ({
  address,
  name,
  note,
  phone: `020 7946 ${phone}`,
  trade,
}));

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <div className="px-4 font-mono text-[#2b2a27]">
      <div
        className="flex items-end justify-between gap-3 pb-[5px]"
        style={{ height: ROLODEX_HEADER_HEIGHT }}
      >
        <span className="truncate font-semibold text-[12.5px] leading-none tracking-[-0.02em]">
          {contact.name}
        </span>
        <span className="shrink-0 text-[#7a6d58] text-[7.5px] uppercase leading-none tracking-[0.08em]">
          {contact.trade}
        </span>
      </div>
      <Row>
        <span className="mr-2 text-[#9a8d76] text-[7.5px] uppercase tracking-[0.08em]">
          Tel
        </span>
        {contact.phone}
      </Row>
      <Row>
        <span className="mr-2 text-[#9a8d76] text-[7.5px] uppercase tracking-[0.08em]">
          Adr
        </span>
        {contact.address}
      </Row>
      <Row className="pl-2 font-sans text-[#3352a3] text-[11px] italic [transform:rotate(-1.2deg)]">
        {contact.note}
      </Row>
    </div>
  );
}

function Row({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-end truncate pb-[3px] text-[10px] leading-none",
        className,
      )}
      style={{ height: ROLODEX_ROW_HEIGHT }}
    >
      {children}
    </div>
  );
}

const items: RolodexItem[] = contacts.map((contact) => ({
  content: <ContactCard contact={contact} />,
  id: contact.name,
  label: `${contact.name}, ${contact.trade}. ${contact.phone}. ${contact.address}. ${contact.note}.`,
  tab: contact.name[0],
}));

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function RolodexShowcase() {
  const [sound, setSound] = useState(true);
  const [index, setIndex] = useState(6);
  const openLetter = items[index]?.tab;

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[500px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-10 dark:bg-grayscale-2 max-[520px]:px-2">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute paper sounds" : "Play paper sounds"}
          aria-pressed={sound}
          className="absolute top-3 right-3 z-[1] flex size-8 items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
          onClick={() => setSound((current) => !current)}
          type="button"
        >
          {sound ? (
            <SpeakerHighIcon size={15} weight="bold" />
          ) : (
            <SpeakerSlashIcon size={15} weight="bold" />
          )}
        </button>

        <Rolodex
          className="relative z-[1] max-[420px]:-my-6 max-[420px]:scale-[0.84]"
          index={index}
          items={items}
          label="Contacts"
          onIndexChange={setIndex}
          sound={sound}
        />

        <nav
          aria-label="Jump to a letter"
          className="relative z-[1] mt-4 flex max-w-[360px] flex-wrap justify-center gap-0.5"
        >
          {alphabet.map((letter) => {
            const target = items.findIndex((item) => item.tab === letter);
            const isOpen = letter === openLetter;

            return (
              <button
                aria-current={isOpen ? "true" : undefined}
                aria-label={`Jump to ${letter}`}
                className={cn(
                  "flex size-[22px] items-center justify-center rounded-md font-medium font-mono text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 disabled:cursor-default disabled:text-grayscale-6",
                  isOpen
                    ? "bg-grayscale-12 text-grayscale-1"
                    : "text-grayscale-10 enabled:hover:bg-grayscale-3 enabled:hover:text-grayscale-12 dark:enabled:hover:bg-grayscale-4",
                )}
                disabled={target === -1}
                key={letter}
                onClick={() => setIndex(target)}
                type="button"
              >
                {letter}
              </button>
            );
          })}
        </nav>

        <p className="relative z-[1] mt-4 text-center text-grayscale-9 text-xs">
          Flick the cards, scroll, or use the arrow keys. Type a letter to jump.
        </p>
      </div>
    </div>
  );
}

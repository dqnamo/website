import type { ReactNode } from "react";
import { writings as essays, formatPublished } from "@/lib/writings";

export type TimelineKind = "project" | "job" | "writing" | "life" | "component";

export interface TimelineEntry {
  /** Defaults to the title; needed when titles can repeat. */
  id?: string;
  title: string;
  /** YYYY-MM-DD. Orders a year's entries when other entries are mixed in. */
  date?: string;
  /** The very start of the line: a dot on the rail with the title under it. */
  terminal?: boolean;
  /** How many things this entry stands for in filter counts. Defaults to 1. */
  count?: number;
  /** A few pictures under the description. */
  gallery?: TimelineGallery;
  /** A YouTube clip, played in place when its thumbnail is clicked. */
  video?: TimelineVideo;
  /** A round picture above the title, like a company's logo. */
  avatar?: TimelineAvatar;
  /** Something richer than text, shown under the title (like a card). */
  content?: ReactNode;
  /** A small line under the title, like a job's role and dates. */
  meta?: string;
  /** Can be empty for entries that speak for themselves. */
  description: string;
  href?: string;
  /** Usually one; a company I founded is both a job and a project. */
  kinds: TimelineKind[];
}

export interface TimelineImage {
  /** A path under /public. */
  src: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * A flat list packs into a two-column masonry grid. A list of rows sets each
 * row at one shared height, so a picture's width follows its shape and the
 * rows you put it in: alone it fills the width, beside others it shrinks.
 */
export type TimelineGallery = TimelineImage[] | TimelineImage[][];

export interface TimelineVideo {
  youtubeId: string;
  /** The video's own title, read out to screen readers. */
  title: string;
  /** A 16:9 still under /public, so nothing loads from YouTube until it's played. */
  thumbnail: string;
}

export interface TimelineAvatar {
  /** Falls back to `initials` when there's no logo. */
  src?: string;
  initials: string;
  /** For bare marks that need room around them (and invert in dark mode). */
  padded?: boolean;
  /** No logo to show: a plain black tile with a question mark. */
  unknown?: boolean;
  /** A black logo that would vanish on a dark background, so it flips to white. */
  invertInDark?: boolean;
}

export interface TimelineYear {
  id: string;
  year: number;
  entries: TimelineEntry[];
}

type RawEntry = readonly [title: string, description: string, href?: string];

/** Things I built or started, including client builds that weren't a role. */
const projects = new Set([
  "Sheepdog",
  "Tiny Dublin",
  "designengineer.world",
  "London Underground map builder",
  "Superlayer",
  "compoundname.com",
  "/computer",
  "Serverless sync engine",
  "Relaunched Hyperaide",
  "Lobster Chess",
  "Ghost",
  "Userplex / SeerStack",
  "instant-ruby",
  "LLM Poker",
  "Growdoro",
  "Launched Growdoro v2",
  "Contract work at ReadySetRecover",
  "MVP as a service",
  "React Native app for Urbanvolt",
  "Creating a online streaming TV channel",
  "Making websites to host links to my favourite shows on Disney Channel",
  "Mini bussiness in school",
  "Made YouTube channel that got 2 million views in one week",
  "Raj Apparel",
  "Won my first Startup Weekend",
  "Cases for Causes",
  "BetFree",
  "desire.ie",
  "Playlist Lab",
  "Fammli",
  "TrueTime",
  "ThreeDo",
  "Free planning poker for dev teams",
  "Open source Bear alternative",
  "Ballermatch",
  "Old Hyperaide",
  "YC application helper",
  "Chatlango",
  "Blogtopod",
  "YC Mentor",
  "AI employee in Slack called Wonderworker",
  "CollabGPT",
  "Prompt Hunt",
  "Promptspec",
  "Voice medical simulations",
  "Split Party",
  "Timber",
  "GPT Maxx",
  "Selling Stoicism books on Amazon",
  "A Spotify podcast",
]);

/** Things I wrote. None yet. */
const writings = new Set<string>([]);

/** When things happened, for years where entries are sorted by date. */
const dates: Record<string, string> = {
  Sheepdog: "2026-11-15",
  "Tiny Dublin": "2026-11-12",
  "designengineer.world": "2026-11-03",
  "London Underground map builder": "2026-10-27",
  "Launched Growdoro v2": "2026-10-26",
  Superlayer: "2026-09-30",
  "compoundname.com": "2026-07-27",
  "/computer": "2026-07-24",
  "The Interface Company of London": "2026-06-01",
  "Serverless sync engine": "2026-04-24",
  "Relaunched Hyperaide": "2026-04-13",
  "Lobster Chess": "2026-01-31",
  Ghost: "2026-01-16",
  "Userplex / SeerStack": "2026-01-04",
};

/** Pictures for entries that are better seen than read about. */
const galleries: Record<string, TimelineGallery> = {
  // Rows, so the logo can sit small beside the hero and the app gets room.
  Sheepdog: [
    [
      {
        src: "/timeline/sheepdog/logo.svg",
        alt: "The Sheepdog logo",
        width: 400,
        height: 400,
      },
      {
        src: "/timeline/sheepdog/hero.webp",
        alt: "Sheepdog's home page: tend, manage and drive your cloud coding agents. A border collie watches a flock of sheep.",
        width: 1200,
        height: 575,
      },
    ],
    [
      screenshot(
        "/timeline/sheepdog/ui.webp",
        "Sheepdog's app: a task list, an agent adding a Deploy to Cloudflare button, and the site open in Previews",
      ),
      {
        src: "/timeline/sheepdog/collie-goggles-white.webp",
        alt: "Sheepdog's border collie in rainbow ski goggles, dissolving into pixel blocks",
        width: 600,
        height: 803,
      },
    ],
  ],
  "designengineer.world": [
    {
      src: "/timeline/designengineer-world/logo.webp",
      alt: "The designengineer.world logo: a globe ringed with its name",
      width: 600,
      height: 600,
    },
    {
      src: "/timeline/designengineer-world/globe.webp",
      alt: "designengineer.world: a globe with design engineers pinned where they live",
      width: 900,
      height: 893,
    },
  ],
  "London Underground map builder": [
    {
      src: "/timeline/underground-map/london-paper.webp",
      alt: "The whole London Underground drawn in the map builder",
      width: 1200,
      height: 738,
    },
    {
      src: "/timeline/underground-map/central-night.webp",
      alt: "Central London on the map builder's night canvas",
      width: 1200,
      height: 900,
    },
  ],
  "Tiny Dublin": [
    {
      src: "/timeline/tiny-dublin/poolbeg.webp",
      alt: "The Poolbeg Chimneys on Tiny Dublin",
      width: 640,
      height: 860,
    },
    {
      src: "/timeline/tiny-dublin/croke-park.webp",
      alt: "Croke Park on Tiny Dublin",
      width: 800,
      height: 800,
    },
    {
      src: "/timeline/tiny-dublin/oconnell-bridge.webp",
      alt: "O'Connell Bridge and the city centre on Tiny Dublin",
      width: 900,
      height: 640,
    },
  ],
  Growdoro: [
    {
      src: "/timeline/growdoro/morning-glory.webp",
      alt: "A morning glory growing on a block of grass",
      width: 500,
      height: 464,
    },
    {
      src: "/timeline/growdoro/bird-of-paradise.webp",
      alt: "A bird of paradise growing on a block of grass",
      width: 341,
      height: 500,
    },
    {
      src: "/timeline/growdoro/carnation.webp",
      alt: "Carnations growing on a block of grass",
      width: 407,
      height: 500,
    },
    {
      src: "/timeline/growdoro/ghost-orchid.webp",
      alt: "A ghost orchid growing on a block of grass",
      width: 426,
      height: 500,
    },
  ],
  "Launched Growdoro v2": [
    {
      src: "/timeline/growdoro/garden-day.webp",
      alt: "A voxel garden of daisies, foxgloves and ferns on Growdoro v2",
      width: 800,
      height: 540,
    },
    {
      src: "/timeline/growdoro/app.webp",
      alt: "Growdoro v2: a focus timer next to the garden",
      width: 820,
      height: 522,
    },
  ],
  "compoundname.com": [
    screenshot(
      "/timeline/compoundname/website.webp",
      "compoundname.com: not getting a .com is a skill issue",
    ),
  ],
  "/computer": [
    screenshot(
      "/timeline/computer/website.webp",
      "/computer: turn every Slack channel into a computer",
    ),
  ],
  "LLM Poker": [
    screenshot(
      "/timeline/llm-poker/website.webp",
      "LLM Poker: models seated around a dark poker table",
    ),
  ],
};

/** A desktop screenshot of a site or app, taken at 1280×800. */
function screenshot(src: string, alt: string): TimelineImage {
  return { src, alt, width: 1200, height: 750 };
}

/** Logos for projects, shown above their titles like a company's. */
/** Clips for entries that are better watched than read about. */
const videos: Record<string, TimelineVideo> = {
  "Mastered a niche game": {
    youtubeId: "zJQ_1kpI99Q",
    title: "MAG PS3 online gameplay: 256 people",
    thumbnail: "/timeline/mag/thumbnail.webp",
  },
};

const logos: Record<string, string> = {
  Fammli: "/timeline/fammli/mark.webp",
  CollabGPT: "/timeline/collabgpt/mark.webp",
  "Prompt Hunt": "/timeline/prompt-hunt/mark.webp",
  "GPT Maxx": "/timeline/gpt-maxx/mark.webp",
  "Lobster Chess": "/timeline/lobster-chess/mark.webp",
};

/** Anything not listed above is a life event, like moving country. */
function kindOf(title: string): TimelineKind {
  if (projects.has(title)) return "project";
  if (writings.has(title)) return "writing";
  return "life";
}

/** A role from my CV, placed in the year it started. */
function job({
  company,
  role,
  start,
  description,
  href,
  logo,
  logoIsMark = false,
  logoInvertsInDark = false,
  alsoProject = false,
}: {
  company: string;
  role: string;
  /** When it started; no end date, it's a timeline. */
  start: string;
  description: string;
  href?: string;
  /**
   * A path under /public, or "unknown" for a question-mark tile. Without
   * one, the company's initials are shown.
   */
  logo?: string;
  logoIsMark?: boolean;
  logoInvertsInDark?: boolean;
  alsoProject?: boolean;
}): TimelineEntry {
  return {
    title: company,
    meta: `${role} · ${start}`,
    description,
    href,
    avatar: {
      src: logo === "unknown" ? undefined : logo,
      unknown: logo === "unknown",
      initials: company
        .split(/\s+/)
        .filter((word) => /^[A-Z]/.test(word))
        .map((word) => word[0])
        .join("")
        .slice(0, 2),
      padded: logoIsMark,
      invertInDark: logoInvertsInDark,
    },
    kinds: alsoProject ? ["job", "project"] : ["job"],
  };
}

function timelineEvents(
  entries: readonly (RawEntry | TimelineEntry)[],
): TimelineEntry[] {
  return entries.map((entry) => {
    if (!("length" in entry)) {
      return {
        ...entry,
        date: entry.date ?? dates[entry.title],
        gallery: entry.gallery ?? galleries[entry.title],
      };
    }
    const [title, description, href] = entry;
    const logo = logos[title];
    return {
      title,
      description,
      href,
      kinds: [kindOf(title)],
      date: dates[title],
      gallery: galleries[title],
      video: videos[title],
      avatar: logo ? { src: logo, initials: "" } : undefined,
    };
  });
}

const lifeline: {
  milestones: Record<number, { id: string; events: TimelineEntry[] }>;
} = {
  milestones: {
    1998: {
      id: "born",
      events: timelineEvents([
        { title: "Born", description: "", kinds: ["life"], terminal: true },
      ]),
    },
    2005: {
      id: "moved-to-ireland",
      events: timelineEvents([
        [
          "Moved to Ireland",
          "Moved to Ireland from India. Honestly I settled in pretty quick and the transition wasn't too dramatic.",
        ],
      ]),
    },
    2008: {
      id: "graphic-design",
      events: timelineEvents([
        [
          "Baby steps in graphic design",
          "Me and my friends would make graphic designs as our Orkut profile pictures. There would be an unspoken competition to see who made the best designs. My brother usually won.",
          "https://en.wikipedia.org/wiki/Orkut",
        ],
      ]),
    },
    2009: {
      id: "orkut-communities",
      events: timelineEvents([
        [
          "Made communities on Orkut",
          "Creating communities on Orkut for football players or video games I was interested in. I can't even remember my motivation for this.",
          "https://en.wikipedia.org/wiki/Orkut",
        ],
      ]),
    },
    2010: {
      id: "first-websites",
      events: timelineEvents([
        [
          "Creating a online streaming TV channel",
          "Thought I was a genius when I discovered live streaming and thought maybe I could create a full TV channel by just getting episodes from shows and airing them.",
        ],
        [
          "Making websites to host links to my favourite shows on Disney Channel",
          "My parents didn't pay for cable so me and my brother would watch shows online. We started making websites on WordPress so that we can collect them all in one place. Is this illegal?",
        ],
      ]),
    },
    2013: {
      id: "mastered-mag",
      events: timelineEvents([
        [
          "Mastered a niche game",
          "Obsessed with a first person shooter called MAG that barely anyone played. I still miss it to this day. 250 players at the same time on PS3. Insane! Nothing has come close to it yet. Here's a clip.",
          "https://www.youtube.com/watch?v=zJQ_1kpI99Q",
        ],
      ]),
    },
    2014: {
      id: "school-businesses",
      events: timelineEvents([
        ["Became a certified lifeguard", "Something cool to have I guess."],
        [
          "Mini bussiness in school",
          "We would run events in school during lunch like quizes and stuff. Apparently this was a good enough business to make it to the county finals lol.",
        ],
        ["Student of the year", "Meh."],
        [
          "Made a clan on BF4 of 100+ players",
          "One of my friends gave me his copy of BF4 for the Christmas holidays and my addiction began. Whenever I get into a game I get obsessive, so it can't just be a casual game, I have to go deep. So decided to be a leader of a clan.",
          "https://en.wikipedia.org/wiki/Battlefield_4",
        ],
      ]),
    },
    2015: {
      id: "school-and-youtube",
      events: timelineEvents([
        [
          "Graphic design and other stuff in school",
          "Graphic design, student council stuff. Never shyed away from doing stuff and helping out. An excuse to get out of class was my main motivation.",
        ],
        [
          "Made YouTube channel that got 2 million views in one week",
          "Started a clip channel for one of my favourite TV shows at the time called Wild 'n Out. Clip channels weren't as big of a thing at the time but I was always searching for certain clip compilations and nothing would show up. I made a clip compilation using iMovie and it got 1 million views in a few days. Made 2 more videos that people in the comments asked for and then dipped. Realised without money the motivation to do something is acc quite low (can't monetise due to copyright issues). Seems like the first time I hit PMF tho!",
          "https://en.wikipedia.org/wiki/Wild_%27n_Out",
        ],
      ]),
    },
    2016: {
      id: "first-startup-weekend",
      events: timelineEvents([
        ["Turned 18", ""],
        [
          "Raj Apparel",
          "An western and Indian fusion clothing brand. Got some of my friends to model. In my head I was gonna be the next Tommy Hilfiger.",
        ],
        [
          "Won my first Startup Weekend",
          "Won my first Startup Weekend on fashion tech. Met some cool people and learned how much of a difference a good team can make. Had a great team with @sainanth, @laurence, and @jamiu. We built an app called Kloset that serves as a digital representation of your wardrobe.",
        ],
        [
          "Got a dog",
          "A lab called Leo. This was a humbling experience. The responsiblity of taking care of a living thing was something I was not prepared for. I wasn't a great owner at all but he was always a great dog <3. Here's a pic of him.",
        ],
      ]),
    },
    2017: {
      id: "objective-media",
      events: timelineEvents([
        [
          "Cases for Causes",
          "Selling phone cases associated with a charity so some money goes to the cause. Was fully in my ecommerce era.",
        ],
        [
          "Became a class rep for my course",
          "Was meant to be a vote but literally no one cared in my class so a few of us just put our names on the form and we became joint class reps. Sometimes you just have to see the gap and go for it.",
        ],
      ]),
    },
    2018: {
      id: "uni-projects",
      events: timelineEvents([
        job({
          company: "Maynooth Students' Union",
          logo: "unknown",
          role: "Graphic Designer",
          start: "Sep 2018",
          description:
            "Started doing some graphic design for my uni and the students' union. Mostly posters for events and things.",
        }),
        job({
          company: "Objective Media",
          logo: "unknown",
          role: "Co-founder",
          start: "Jun 2018",
          description:
            "A creative agency I founded with my friend @laurence. We made websites and videos for some cool brands. Laurence now does some cool product design stuff with Light Phone in New York.",
          href: "https://www.thelightphone.com/",
        }),
        [
          "BetFree",
          "Social betting platform using fake money. Third year group project. We didn't even have a backend lmao, we just put everything in frontend JS and thought we done something. We were confident af tho. Dunning–Kruger effect was real.",
        ],
        [
          "desire.ie",
          "Ecommerce platform to dropship known brands from a Italian supplier. Me and my brother acc printed leaflets that we went around in Maynooth and within 5 minutes we realised maybe we should stick to building software.",
        ],
      ]),
    },
    2019: {
      id: "playlist-lab",
      events: timelineEvents([
        job({
          company: "Identity Square",
          logo: "unknown",
          role: "Software Engineer Intern",
          start: "Feb 2019",
          description:
            "I completed an intensive accelerated internship focused on full-stack development, primarily using Ruby on Rails. During the program, I worked on several client and personal projects, gaining hands-on experience in developing web applications from start to finish.",
        }),
        [
          "Playlist Lab",
          "A platform that allows you to improve your Spotify playlist by increasing danceability, energy, etc. Project for music engineering module in uni, built with @alan. We finished it one week and apparently this was a bad thing for our lecturers ???",
          "https://github.com/dqnamo/PlaylistLab",
        ],
      ]),
    },
    2020: {
      id: "graduated",
      events: timelineEvents([
        job({
          company: "Nurture",
          logo: "/logos/companies/nurture.png",
          role: "Founding Software Engineer (contract)",
          start: "Jun 2020",
          description:
            "First engineer at a edtech startup in Ireland. Felt the first dopamine rush of user feedback for a product you are building. Learned a lot from the the two founders @dave and @podge.",
          href: "https://gonurture.com",
        }),
        [
          "Graduated from uni",
          "Comp sci major. Honestly learnt nothing here. Went to a handful of lectures and spent my final year mostly playing poker.",
        ],
        [
          "Fammli",
          "My final year project. A app for families to manange tasks and events. A shared calendar and todo list basically. Started building 2 weeks before the deadline, I was already getting quite confident in my Rails skills lol. (Prob will be the worst code you have ever seen at this time.)",
        ],
        [
          "TrueTime",
          "A app that lets you know exact locations of public transport using the locations of users already on it. Gave up when I realised mobile app dev is not easy :(",
        ],
      ]),
    },
    2021: {
      id: "first-engineering-role",
      events: timelineEvents([
        [
          "Went solo travelling around Europe",
          "First time travelling on my own. Went solo and travelled around Europe, mostly interrailing. Thought I would work and travel at the same time but this was a massive lie lmao. Got to do some cool shit tho. Was in the stand for Messi's first PSG goal against Manchester City in the Champions League. Once in a lifetime stuff.",
          "https://www.youtube.com/watch?v=rSbwRPgOZV4",
        ],
        [
          "Contract work at ReadySetRecover",
          "A platform that helps people with their surgery preperation and recovery. Was one of the best designed apps that I helped build.",
          "https://readysetrecover.com",
        ],
        [
          "ThreeDo",
          "A todo app that only lets you do 3 things at a time. Built it to learn SwiftUI. Got inspired from a this YouTube video by @garret.",
          "https://www.youtube.com/watch?v=D9kOyqPNW_A",
        ],
      ]),
    },
    2022: {
      id: "Zedball",
      events: timelineEvents([
        job({
          company: "Zedball",
          logo: "/logos/companies/zedball.jpg",
          role: "Founder",
          start: "Feb 2022",
          description:
            "My first startup. A web3 football management game using Sorare assets. Learned so much from this experience and honestly looking back it was the most fun I've had. We built it along with a bunch of my friends: @lydia, @alan, @angela, @jake, @akhil, @ionathan and my brother. My biggest regret is bringing my friends into an absolute shitshow of a startup lol but we had fun. Protip: don't get on a hype train or build a game as your first startup. First time I acc realised how hard building a startup is.",
          href: "https://sorare.com",
          alsoProject: true,
        }),
        [
          "MVP as a service",
          "I was getting quite good at shipping fast so thought I'd build for others. My only client was my brother.",
        ],
        [
          "Free planning poker for dev teams",
          "Built a small tool to help dev teams. Wanted to build this so I can learn some Turbo Drive stuff.",
        ],
        [
          "Open source Bear alternative",
          "Built a note taking app called Koala one weekend. First success on Product Hunt. Felt the power of open source.",
          "https://github.com/dqnamo/koala",
        ],
        [
          "Ballermatch",
          "A place to orangise local football games with friends and strangers. Thought it would be my first startup but ended up working on Zedball.",
        ],
      ]),
    },
    2023: {
      id: "internet-money",
      events: timelineEvents([
        ["Moved to London", ""],
        job({
          company: "DigitalGenius",
          logo: "/logos/companies/digitalgenius.png",
          role: "AI Engineer (contract)",
          start: "May 2023",
          description:
            "Dev work for DigitalGenius building voice customer service agents. Was a fun project but SIP is the most annoying thing I ever dealt with. If you haven't heard of SIP, just be happy. A indie hacker inside the company. Ik it sounds weird but I just fill in gaps and work with the CEO to try out random things and build prototypes. Also learn a lot from the CEO @bogdan.",
          href: "https://digitalgenius.com",
        }),
        [
          "Old Hyperaide",
          "A platform to build the AI brain of your application. With logs for your LLM requests and much more. Was interesting and got some revenue but didn't see myself working on it long term.",
          "https://hyperaide.com",
        ],
        [
          "YC application helper",
          "An AI powered form that improves your YC application, a lot of people ended up using it on launch day and it raked up my OpenAI bills.",
          "https://ycombinator.com",
        ],
        [
          "Chatlango",
          "A new way to practice languages. Talk to AI bots and learn a language. They also proactively message you. Got a bunch of users. No revenue.",
          "https://chatlango.com",
        ],
        [
          "Blogtopod",
          "Convert your existing blog posts to podcast episodes. Built it with my friend @harish. Some revenue and we sold it a month later on MicroAcquire.",
        ],
        [
          "YC Mentor",
          "A AI chat that references YC knowledge. Used by over 3000 startup founders and done decent on Product Hunt.",
          "https://ycmentor.com",
        ],
        [
          "AI employee in Slack called Wonderworker",
          "An AI employee in Slack that can do a bunch of stuff. Was exploring this idea with my friend @marcel and my brother @daniel.",
        ],
        [
          "CollabGPT",
          "Use ChatGPT collaboratively. Built it, got revenue and sold on MicroAcquire all in one week. Was my first taste of internet money.",
          "https://github.com/dqnamo/collabgpt",
        ],
        [
          "Prompt Hunt",
          "A place to find prompts that people are using. Like Product Hunt. Everyone thought a place like this would be a thing but it doesn't seem to be the case?",
          "https://github.com/dqnamo/prompthunt",
        ],
        [
          "Promptspec",
          "A framework to define prompts directly in your codebase. Something that me and my brother were exploring.",
          "https://github.com/Hyperaide/promptspec",
        ],
        [
          "React Native app for Urbanvolt",
          "Learnt React Native so I can build this app for a client. Used Expo and the developer experience was one of the best I've ever had.",
          "https://urbanvolt.com",
        ],
      ]),
    },
    2026: {
      id: "interface",
      events: timelineEvents([
        [
          "Sheepdog",
          "My personal, cloud only development workspace. Configure your workspace any way you like and each task gets the perfect environment. Now on Mac, Linux and iOS (TestFlight beta).",
          "https://sheepdog.build",
        ],
        [
          "Tiny Dublin",
          "Made an isometric pixel art map of metro Dublin, from Lucan to Howth. About 650 km² of land and about 6.6 billion pixels.",
          "https://github.com/dqnamo/tinydublin",
        ],
        [
          "designengineer.world",
          "Made a lil something to discover design engineers that I quite like from around the world :) Now has jobs too.",
          "https://designengineer.world",
        ],
        [
          "London Underground map builder",
          "Make your own custom London Underground maps using this map builder.",
          "/underground-map",
        ],
        [
          "Launched Growdoro v2",
          "A gamified focus timer where you can grow an infinite garden. V2 went live on Oct 26.",
          "https://growdoro.com",
        ],
        [
          "Superlayer",
          "An instant backend for all your app ideas.",
          "https://superlayer.dev",
        ],
        [
          "compoundname.com",
          "Let me name your startup. I consistently get base price .com domains for my friends and myself. Only compound names.",
          "https://compoundname.com",
        ],
        [
          "/computer",
          "Turn every Slack channel into a persistent computer. /computer init gives you and your teammates on a channel a collaborative cloud computer to work on. You can even bring your own coding agents.",
        ],
        job({
          company: "The Interface Company of London",
          logo: "/logos/interface-logo-black.svg",
          logoInvertsInDark: true,
          role: "Founder",
          start: "Jun 2026",
          description:
            "Digital studio based in London. We design and engineer products for others and for ourselves, with a focus on scalable, performant, aesthetically pleasing engineering.",
          href: "https://interface.london",
        }),
        [
          "Serverless sync engine",
          "A sync engine you can host fully on Cloudflare, using Workers, Durable Objects and D1. Can also connect to a Postgres database.",
          "https://github.com/dqnamo/serverless-sync",
        ],
        [
          "Relaunched Hyperaide",
          "Nuked 80% of the codebase. Old Hyperaide could do a lot. New Hyperaide does a few things, perfectly. One database per user. Infinitely extendable. Talk to it on WhatsApp.",
          "https://hyperaide.com",
        ],
        [
          "Lobster Chess",
          "Let your OpenClaws have some downtime and play some chess with other OpenClaws.",
          "https://github.com/dqnamo/lobster-chess",
        ],
        [
          "Ghost",
          "Vibe coded an Obsidian plugin so I can have all my AI conversations as files.",
          "https://github.com/dqnamo/ghost",
        ],
        [
          "Userplex / SeerStack",
          "The most enjoyable product analytics and simple logging tool. Been using it personally for all my projects for a while. Create dashboards in seconds with natural language.",
          "https://seerstack.com",
        ],
      ]),
    },
    2025: {
      id: "chat-and-side-projects",
      events: timelineEvents([
        ...essays.map(
          (essay): TimelineEntry => ({
            title: essay.title,
            meta: formatPublished(essay.published),
            description: "",
            href: `/writing/${essay.slug}`,
            kinds: ["writing"],
          }),
        ),
        [
          "instant-ruby",
          "Made a lightweight, idiomatic Ruby client for InstantDB.",
          "https://github.com/dqnamo/instant-ruby",
        ],
        [
          "LLM Poker",
          "Made LLMs play poker against each other for Vercel's AI Gateway eval game hackathon.",
          "https://llmpoker.com",
        ],
        [
          "Growdoro",
          "Grow an infinite garden while doing focus timers. By November more than 11,000 focus sessions had been done on it.",
          "https://growdoro.com",
        ],
      ]),
    },
    2024: {
      id: "Hyperaide",
      events: timelineEvents([
        job({
          company: "Hyperaide",
          logo: "/logos/hyperaide.svg",
          logoIsMark: true,
          role: "Founder",
          start: "Jan 2024",
          description:
            "A personal assistant that manages your tasks, notes and bookmarks. Building this part time since start of year. Made it basically for myself first and foremost.",
          href: "https://hyperaide.com",
          alsoProject: true,
        }),
        [
          "Voice medical simulations",
          "A way to practice for practical exams for medical students. Built it for a med school friend who said it could be useful. Using ElevenLabs and GPT-4o.",
        ],
        [
          "Split Party",
          "A way to split bills by item using GPT Vision. Built it one night when my friends who live together said they have a problem splitting bills. Classic tarpit idea.",
        ],
        [
          "Timber",
          "Tried to build an open source alternative to LogSnag one weekend on Rails. Ended up not going anywhere.",
          "https://github.com/dqnamo/timber",
        ],
        [
          "GPT Maxx",
          "An April Fools project I done with my friend @romil. It's a little tool to trick your friends into thinking AI knows everything about them.",
        ],
        [
          "Selling Stoicism books on Amazon",
          "Wanted to see if me and my friends could sell books from lesser known Stoic philosophers on Amazon. Didn't go anywhere.",
          "https://en.wikipedia.org/wiki/Stoicism",
        ],
        [
          "A Spotify podcast",
          "Not really a podcast, just some one take thoughts posted on Spotify.",
        ],
      ]),
    },
  },
};

/** Years with something in them, newest first. */
export const lifeTimeline: TimelineYear[] = Object.entries(lifeline.milestones)
  .map(([year, { id, events }]) => ({
    id,
    year: Number(year),
    entries: events,
  }))
  .sort((a, b) => b.year - a.year);

/**
 * Mixes extra entries (like the kitchen's monthly components) into the
 * years they belong to. Years that get extras are re-sorted by date,
 * newest first; entries without a date keep their place at the end.
 */
export function withExtraEntries(
  years: TimelineYear[],
  extras: TimelineEntry[],
): TimelineYear[] {
  const byYear = new Map(years.map((year) => [year.year, { ...year }]));

  for (const extra of extras) {
    const year = Number(extra.date?.slice(0, 4));
    const target = byYear.get(year) ?? {
      id: `year-${year}`,
      year,
      entries: [],
    };
    target.entries = [...target.entries, extra];
    byYear.set(year, target);
  }

  const touched = new Set(
    extras.map((extra) => Number(extra.date?.slice(0, 4))),
  );

  return [...byYear.values()]
    .map((year) =>
      touched.has(year.year)
        ? {
            ...year,
            entries: [...year.entries].sort((a, b) =>
              (b.date ?? "").localeCompare(a.date ?? ""),
            ),
          }
        : year,
    )
    .sort((a, b) => b.year - a.year);
}

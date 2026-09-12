import type { LifelineEvent } from "@/components/lifeline";
import { defineLifeline } from "@/lib/lifeline-data";

type TimelineEntry = readonly [
  title: string,
  description: string,
  href?: string,
];

function timelineEvents(entries: readonly TimelineEntry[]): LifelineEvent[] {
  return entries.map(([title, description, href]) => [
    href
      ? { type: "link", value: title, href }
      : { type: "text", value: title },
    { type: "text", value: ` — ${description}` },
  ]);
}

export const dqnamoLifeline = defineLifeline({
  slug: "timeline",
  name: "dqnamo",
  birthYear: 1999,
  description:
    "A list of random stuff I have done since I was a kid. Most of it is trash or a failure.",
  milestones: {
    2005: {
      id: "moved-to-ireland",
      events: timelineEvents([
        [
          "moved to ireland",
          "moved to ireland from india. honestly i settled in pretty quick and the transition wasnt too dramatic",
        ],
      ]),
    },
    2008: {
      id: "graphic-design",
      events: timelineEvents([
        [
          "baby steps in graphic design",
          "me and my friends would make graphic designs as our orkut profile pictures. there would be an unspoken competition to see who made the best designs. my brother usually won.",
          "https://en.wikipedia.org/wiki/Orkut",
        ],
      ]),
    },
    2009: {
      id: "orkut-communities",
      events: timelineEvents([
        [
          "made communities on orkut",
          "creating communities on orkut for football players or video games i was interested in. i cant even remember my motivation for this",
          "https://en.wikipedia.org/wiki/Orkut",
        ],
      ]),
    },
    2010: {
      id: "first-websites",
      events: timelineEvents([
        [
          "creating a online streaming tv channel",
          "thought i was a genius when i discovered live streaming and thought maybe i could create a full tv channel by just getting episodes from shows and airing them.",
        ],
        [
          "making websites to host links to my favourite shows on disney channel",
          "my parents didnt pay for cable so me and my brother would watch shows online. we started making websites on wordpress so that we can collect them all in one place. is this illegal?",
        ],
      ]),
    },
    2013: {
      id: "mastered-mag",
      events: timelineEvents([
        [
          "mastered a niche game",
          "obsessed with a first person shooter called mag that barely anyone played. i still miss it to this day. 250 players at the same time on ps3. insane! nothing has come close to it yet. heres a clip",
          "https://www.youtube.com/watch?v=zJQ_1kpI99Q",
        ],
      ]),
    },
    2014: {
      id: "school-businesses",
      events: timelineEvents([
        ["became a certified lifeguard", "something cool to have i guess."],
        [
          "mini bussiness in school",
          "we would run events in school during lunch like quizes and stuff. apparently this was a good enough business to make it to the county finals lol",
        ],
        ["student of the year", "meh"],
        [
          "made a clan on bf4 of 100+ players",
          "one of my friends gave me his copy of bf4 for the christmas holidays and my addiction began. whenever i get into a game i get obsessive, so it cant just be a casual game, i have to go deep. so decided to be a leader of a clan",
          "https://en.wikipedia.org/wiki/Battlefield_4",
        ],
      ]),
    },
    2015: {
      id: "school-and-youtube",
      events: timelineEvents([
        [
          "graphic design and other stuff in school",
          "graphic design, student council stuff. never shyed away from doing stuff and helping out. an excuse to get out of class was my main motivation.",
        ],
        [
          "made youtube channel that got 2 million views in one week",
          "started a clip channel for one of my favourite tv shows at the time called wildnout. clip channels werent as big of a thing at the time but i was always searching for certain clip compilations and nothing would show up. i made a clip compilation using imovie and it got 1 million views in a few days. made 2 more videos that people in the comments asked for and then dipped. realised without money the motivation to do something is acc quite low (cant monetise due to copyright issues). seems like the first time i hit pmf tho!",
          "https://en.wikipedia.org/wiki/Wild_%27n_Out",
        ],
      ]),
    },
    2016: {
      id: "first-startup-weekend",
      events: timelineEvents([
        [
          "raj apparel",
          "an western and indian fusion clothing brand. got some of my friends to model. in my head i was gonna be the next tommy hilfiger.",
        ],
        [
          "won my first startup weekend",
          "won my first startup weekend on fashion tech. met some cool people and learned how much of a difference a good team can make. had a great team with sainanth, laurence, and jamiu. we built an app called kloset that serves as a digital representation of your wardrobe.",
        ],
        [
          "got a dog",
          "a lab called leo. this was a humbling experience. the responsiblity of taking care of a living thing was something i was not prepared for. i wasnt a great owner at all but he was always a great dog <3. heres a pic of him",
        ],
      ]),
    },
    2017: {
      id: "objective-media",
      events: timelineEvents([
        [
          "cases for causes",
          "selling phone cases associated with a charity so some money goes to the cause. was fully in my ecommerce era",
        ],
        [
          "started doing graphic design for my uni",
          "started doing some graphic design for my uni and the students union. mostly posters for events and things",
        ],
        [
          "became a class rep for my course",
          "was meant to be a vote but literally no one cared in my class so a few of us just put our names on the form and we became joint class reps. sometimes you just have to see the gap and go for it.",
        ],
        [
          "objective media",
          "a creative agency i founded with my friend laurence. we made websites and videos for some cool brands. laurence now does some cool product design stuff with light phone in new york.",
          "https://www.thelightphone.com/",
        ],
      ]),
    },
    2018: {
      id: "uni-projects",
      events: timelineEvents([
        [
          "betfree",
          "social betting platform using fake money. third year group project. we didnt even have a backend lmao, we just put everything in frontend js and thought we done something. we were confident af tho. dunning kruger effect was real.",
        ],
        [
          "desire.ie",
          "ecommerce platform to dropship known brands from a italian supplier. me and my brother acc printed leaflets that we went around in maynooth and within 5 minutes we realised maybe we should stick to building software.",
        ],
      ]),
    },
    2019: {
      id: "playlist-lab",
      events: timelineEvents([
        [
          "playlist lab",
          "a platform that allows you to improve your spotify playlist by increasing danceability, energy, etc. project for music engineering module in uni, built with alan. we finished it one week and apparently this was a bad thing for our lecturers ???",
          "https://github.com/dqnamo/PlaylistLab",
        ],
      ]),
    },
    2020: {
      id: "graduated",
      events: timelineEvents([
        [
          "graduated from uni",
          "comp sci major. honestly learnt nothing here. went to a handful of lectures and spent my final year mostly playing poker.",
        ],
        [
          "fammli",
          "my final year project. a app for families to manange tasks and events. a shared calendar and todo list basically. started building 2 weeks before the deadline, i was already getting quite confident in my rails skills lol. (prob will be the worst code you have ever seen at this time)",
        ],
        [
          "truetime",
          "a app that lets you know exact locations of public transport using the locations of users already on it. gave up when i realised mobile app dev is not easy :(",
        ],
      ]),
    },
    2021: {
      id: "first-engineering-role",
      events: timelineEvents([
        [
          "went solo travelling around europe",
          "first time travelling on my own. went solo and travelled around europe, mostly interrailing. thought i would work and travel at the same time but this was a massive lie lmao. got to do some cool shit tho. was in the stand for messis first psg goal against manchester city in the champions league. once in a lifetime stuff.",
          "https://www.youtube.com/watch?v=rSbwRPgOZV4",
        ],
        [
          "contract work at readysetrecover",
          "a platform that helps people with their surgery preperation and recovery. was one of the best designed apps that i helped build.",
          "https://readysetrecover.com",
        ],
        [
          "engineering at nurture",
          "first engineer at a edtech startup in ireland. felt the first dopamine rush of user feedback for a product you are building. learned a lot from the the two founders dave and podge.",
          "https://gonurture.com",
        ],
        [
          "threedo",
          "a todo app that only lets you do 3 things at a time. built it to learn swift ui. got inspired from a this youtube video by garret flower.",
          "https://www.youtube.com/watch?v=D9kOyqPNW_A",
        ],
      ]),
    },
    2022: {
      id: "zedball",
      events: timelineEvents([
        [
          "MVP as a service",
          "i was getting quite good at shipping fast so thought id build for others. my only client was my brother.",
        ],
        [
          "free planning poker for dev teams",
          "built a small tool to help dev teams. wanted to build this so i can learn some turbo drive stuff.",
        ],
        [
          "open source bear alternative",
          "built a note taking app called koala one weekend. first success on producthunt. felt the power of open source.",
          "https://github.com/dqnamo/koala",
        ],
        [
          "zedball",
          "my first startup. a web3 football management game using sorare assets. learned so much from this experience and honestly looking back it was the most fun ive had. we built it along with a bunch of my friends: lydia, alan, angela, jake, akhil, ionathan and my brother. my biggest regret is bringing my friends into an absolute shitshow of a startup lol but we had fun. protip: dont get on a hype train or build a game as your first startup. first time i acc realised how hard building a startup is.",
          "https://sorare.com",
        ],
        [
          "ballermatch",
          "a place to orangise local football games with friends and strangers. thought it would be my first startup but ended up working on zedball.",
        ],
      ]),
    },
    2023: {
      id: "internet-money",
      events: timelineEvents([
        [
          "old hyperaide",
          "a platform to build the ai brain of your application. with logs for your llm requests and much more. was interesting and got some revenue but didnt see myself working on it long term.",
          "https://hyperaide.com",
        ],
        [
          "yc application helper",
          "an ai powered form that improves your yc application, a lot of people ended up using it on launch day and it raked up my openai bills.",
          "https://ycombinator.com",
        ],
        [
          "chatlango",
          "a new way to practice languages. talk to ai bots and learn a language. they also proactively message you. got a bunch of users. no revenue.",
          "https://chatlango.com",
        ],
        [
          "blogtopod",
          "convert your existing blog posts to podcast episodes. built it with my friend harish. some revenue and we sold it a month later on microacquire.",
        ],
        [
          "yc mentor",
          "a ai chat that references yc knowledge. used by over 3000 startup founders and done decent on producthunt.",
          "https://ycmentor.com",
        ],
        [
          "ai employee in slack called wonderworker",
          "an ai employee in slack that can do a bunch of stuff. was exploring this idea with my friend marcel and my brother daniel",
        ],
        [
          "collabgpt",
          "use chatgpt collaboratively. built it, got revenue and sold on microacquire all in one week. was my first taste of internet money.",
          "https://github.com/dqnamo/collabgpt",
        ],
        [
          "prompt hunt",
          "a place to find prompts that people are using. like producthunt. everyone thought a place like this would be a thing but it doesnt seem to be the case?",
          "https://github.com/dqnamo/prompthunt",
        ],
        [
          "promptspec",
          "a framework to define prompts directly in your codebase. something that me and my brother were exploring.",
          "https://github.com/Hyperaide/promptspec",
        ],
        [
          "some contract work for digitalgenius",
          "dev work for digitalgenius building voice customer service agents. was a fun project but sip is the most annoying thing i ever dealt with. if you havent heard of sip, just be happy.",
          "https://digitalgenius.com",
        ],
        [
          "react native app for urbanvolt",
          "learnt react native so i can build this app for a client. used expo and the developer experience was one of the best ive ever had.",
          "https://urbanvolt.com",
        ],
      ]),
    },
    2024: {
      id: "hyperaide",
      events: timelineEvents([
        [
          "hyperaide",
          "a personal assistant that manages your tasks, notes and bookmarks. building this part time since start of year. made it basically for myself first and foremost",
          "https://hyperaide.com",
        ],
        [
          "innovation engineering at digitalgenius",
          "a indie hacker inside the company. ik it sounds weird but i just fill in gaps and work with the ceo to try out random things and build prototypes. also learn a lot from the ceo bogdan",
          "https://digitalgenius.com",
        ],
        [
          "voice medical simulations",
          "a way to practice for practical exams for medical students. built it for a med school friend who said it could be useful. using elevenlabs and gpt-4o",
        ],
        [
          "split party",
          "a way to split bills by item using gpt vision. built it one night when my friends who live together said they have a problem splitting bills. classic tarpit idea",
        ],
        [
          "timber",
          "tried to build an opensource alternative to logsnag one weekend on rails. ended up not going anywhere.",
          "https://github.com/dqnamo/timber",
        ],
        [
          "gpt maxx",
          "an april fools project i done with my friend romil. its a little tool to trick your friends into thinking ai knows everything about them",
        ],
        [
          "selling stoicism books on amazon",
          "wanted to see if me and my friends could sell books from lesser known stoic philosophers on amazon. didnt go anywhere.",
          "https://en.wikipedia.org/wiki/Stoicism",
        ],
        [
          "a spotify podcast",
          "not really a podcast, just some one take thoughts posted on spotify.",
        ],
      ]),
    },
  },
});

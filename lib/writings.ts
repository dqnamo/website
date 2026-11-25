export type WritingBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string };

export interface Writing {
  slug: string;
  title: string;
  /** YYYY-MM, shown as the month it was written. */
  published: string;
  /** One line for search results and link previews. */
  summary: string;
  blocks: WritingBlock[];
}

/** Essays, each served at /writing/[slug] and listed on the timeline under Writings. */
export const writings: Writing[] = [
  {
    slug: "why-i-stopped-playing-video-games",
    title: "Why I stopped playing video games",
    published: "2025-12",
    summary:
      "I've broken games down into three categories: Treadmill Careers, Movies on Steroids, and Virtual Sports.",
    blocks: [
      {
        type: "paragraph",
        text: "I grew up loving video games. Recently, I have been back home for a while in Ireland and I noticed this box in my room that contained my gaming PC setup which I built years ago.",
      },
      {
        type: "paragraph",
        text: "Which made me think maybe I should set it back up and take it for a spin. But since time is a valuable and scarce resource as I get older, I decided I needed to evaluate it properly before diving back in.",
      },
      {
        type: "paragraph",
        text: "In thinking through this, I have reached the conclusion that I shouldn't be playing video games. This doesn't just apply to me; I think it applies to a lot of others too, so I thought I would write about it.",
      },
      {
        type: "paragraph",
        text: "There are many types of games and gaming. So the first step is to do a clear delineation and then evaluate each category. It's not fair to put playing GTA against playing candy crush on your phone. I found that the best way to classify games isn't by genre, but by their impact on you. Interestingly, Candy Crush and GTA can actually belong to the same category!",
      },
      {
        type: "paragraph",
        text: "I've broken games down into three categories: Treadmill Careers, Movies on Steroids, and Virtual Sports.",
      },
      {
        type: "paragraph",
        text: "Each of these categories have varing degrees of benefit and harm and games can fit in multiple categories depending on you, the player. Let's dive into each one, starting with treadmill careers. In my opinion, this is the most dangerous one.",
      },
      { type: "heading", text: "Treadmill Careers" },
      {
        type: "paragraph",
        text: "Treadmill Careers are games that give you a feeling of achieving something meaningful but after spending 1000 hours in game you don't really get anywhere. These are games that have long term playable value with various goals, where on each milestone you truly feel like you have achieved something. One other defining characteristic is that it is single player. Some games in this category are games like Minecraft, Crusader Kings 3 and Farming Simulator.",
      },
      {
        type: "paragraph",
        text: "These games are just a life replacement. Giving you a sense of accomplishment while you have done nothing in the real world. Now don't get me wrong a lot of this can actually be really great achievements. Building an impressive 1:1 scale replica of Notre Dame in minecraft for example is nothing to dissmiss. But even here the only value is when something in game transcends to real life value. In this example it is the recognition of the real world time effort, the dedication and discipline of the player to commit and carry out to completion such a big task and the attention to detail that the player is employing.",
      },
      {
        type: "paragraph",
        text: "The biggest problem with Treadmill Careers is that real world achievements and careers will never be able to satisfy you. The dopamine you get from real world impact will never be able to compare to the quick and cheap dopamine hits you get from the game. So there is no way out, you will just crave more and more progression in game. I think this must be avoided at all costs. Now maybe there are some of you that can enjoy 1hr of a Treadmill Career to relax and that's fine but perhaps then this is a question of your ambition!",
      },
      { type: "heading", text: "Movies on Steroids" },
      {
        type: "paragraph",
        text: "Now the second category I think is less bad but still better to cut out in my opinion. These are movies on steroids. These are games that have immense storytelling value that just feel like the next evolution of cinema. Games in this category are games like Uncharted, GTA and Read dead redemption. I think these are fine as long as you are limiting your time on them but even if you are just spending 2 hours a day playing these, that's like watching a movie a day. Now everyone's standards are different but watching a movie a day is not something I would allow myself to do.",
      },
      {
        type: "paragraph",
        text: "The other big danger with this category is that when a game is so immersive it can lead to it becoming a treadmill career. When I was playing RDR2, I would plan my future hunting missions, keep track of things I wanted to craft and even put these things in my real life todo list! This is when you know it has stopped being a movie on steroids and has now become a treadmill career. Run away!",
      },
      { type: "heading", text: "Virtual Sports" },
      {
        type: "paragraph",
        text: "Now this last one, I acctually think is the most acceptable one. These are virtual sports. These are games that are timeboxed and have a winner or loser based on a condition. It should also be multiplayer. Some games in this category are Age of Empires, Call of duty, fortnite and League of legends.",
      },
      {
        type: "paragraph",
        text: "These are just like playing irl sports. Time boxed, competitive and can help you improve a lot of skills (communication, collabroation etc). The only problem is that by nature of how games are, the time you spend in this can also easily become too much. Even Playing 2 hours of tennis every day seems a bit excessive for a normal person who is just interested in tennis. The only exception we would make is if you were a pro player. Now this is a real possiblity in virtual sports also. But this is an assesment you must make and see if it is probable that you can be pro to justify investing that amount of time.",
      },
      {
        type: "paragraph",
        text: "Thinking through all this, I've decided the best option for me is not to play any games at all. The categorization clarified my decision. I can't afford a fake career, I don't have time for a daily movie, and I'm not good enough to become a pro. I also realized that after playing games, I can feel my brain seeking more high dopamine activities which I just can't give it.",
      },
      {
        type: "paragraph",
        text: "It goes without saying that this doesn't apply to everyone. These are just the conclusions I've made with my brain being a super biased reference point. So for now Im gonna keep my PC boxed up.",
      },
    ],
  },
];

const monthFormat = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2025-12" -> "December 2025" */
export function formatPublished(published: string): string {
  return monthFormat.format(new Date(`${published}-01`));
}

export function getWriting(slug: string): Writing | undefined {
  return writings.find((writing) => writing.slug === slug);
}

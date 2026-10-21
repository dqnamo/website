import { Code, CodeSample, H2, Li, List, P, Quote } from "../_components/Prose";
import type { Essay } from "../_lib/essays";

function Body() {
  return (
    <>
      <P>
        Look closely at almost any card or button on this site and you&apos;ll
        find the same detail: the border along the bottom is twice as thick as
        the others. It&apos;s one pixel. It&apos;s also the most load-bearing
        decision in the whole visual language.
      </P>

      <H2>Light comes from above</H2>
      <P>
        We read depth from a handful of cues, and the cheapest of them is a
        darker edge underneath. A drop shadow says something is floating. A
        thicker bottom border says it&apos;s resting on the page with a little
        mass, closer to a key on a keyboard than a sheet of paper hovering over
        it.
      </P>
      <P>
        That difference matters for anything you can press. Floating things feel
        like they&apos;ll drift off when you touch them; things with weight feel
        like they&apos;ll give a little and spring back.
      </P>

      <CodeSample
        caption="One class does the work. Everything else is colour."
        code={`
<Link
  className={cn(
    "rounded-[13px] border border-grayscale-4 bg-white",
    "border-b-2", // the whole trick
  )}
  href={href}
>
  {children}
</Link>
`}
      />

      <H2>Why not a shadow?</H2>
      <P>Shadows are lovely, but they come with baggage:</P>
      <List>
        <Li>
          They vanish in dark mode, or turn into a muddy halo around the card.
        </Li>
        <Li>
          They bleed outside the box, so tightly packed grids start to look
          smudged.
        </Li>
        <Li>
          They&apos;re the first thing to look wrong on a cheap screen or a busy
          background.
        </Li>
      </List>
      <P>
        A border has none of those problems. It sits inside the box, flips
        cleanly with the theme, and stays crisp at any density. On this site
        it&apos;s <Code>border-b-2</Code> and a slightly darker grey on hover,
        and that&apos;s it.
      </P>

      <Quote>
        Good details are the ones you only notice once they&apos;re missing.
      </Quote>

      <P>
        Take the thick edge away and nothing breaks. Everything just goes flat,
        and starts to look like a picture of an interface rather than one you
        can use.
      </P>
    </>
  );
}

export const post: Essay = {
  Body,
  description:
    "Why one extra pixel of border does more than a drop shadow to make an interface feel pressable.",
  publishedAt: "2026-10-14",
  slug: "the-bottom-border",
  title: "Every card here has a thicker bottom edge",
};

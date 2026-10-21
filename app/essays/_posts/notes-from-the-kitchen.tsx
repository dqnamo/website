import { A, H2, Li, List, P } from "../_components/Prose";
import type { Essay } from "../_lib/essays";

function Body() {
  return (
    <>
      <P>
        The <A href="/kitchen">kitchen</A> is where I keep the experiments: a
        receipt printer, a deck of playing cards, a button that resizes as its
        label changes. None of them are products. Most of them took an evening.
      </P>

      <H2>Small on purpose</H2>
      <P>
        Client work is wide. It has a dozen screens, a deadline, and opinions
        from everyone in the room. That&apos;s the job, and it&apos;s good work,
        but it rarely leaves room to spend three hours on how a single button
        settles after you press it.
      </P>
      <P>
        An experiment is the opposite. One idea, one page, no roadmap. If it
        doesn&apos;t work, I throw it away and nobody has to sit through a
        retro.
      </P>

      <H2>What carries over</H2>
      <P>The surprising part is how much of it ends up in real projects.</P>
      <List>
        <Li>
          Timing curves tuned for a toy get reused in production almost
          unchanged.
        </Li>
        <Li>
          Building something end to end, in code, catches problems a static mock
          never shows.
        </Li>
        <Li>
          A finished thing to point at beats describing an idea in a meeting.
        </Li>
      </List>
      <P>
        So the kitchen stays open. If something in there is useful to you, take
        it.
      </P>
    </>
  );
}

export const post: Essay = {
  Body,
  description:
    "Why I build small, single-purpose interface experiments, and what they teach that client work doesn't.",
  publishedAt: "2026-09-02",
  slug: "notes-from-the-kitchen",
  title: "Notes from the kitchen",
};

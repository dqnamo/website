import { CodeSample, H2, Li, List, P } from "../_components/Prose";
import type { Essay } from "../_lib/essays";

function Body() {
  return (
    <>
      <P>
        Most of the animation I cut from projects fails the same test: turn it
        off, and do you lose any information? If not, it was decoration, and
        decoration costs a little every single time someone uses the product.
      </P>

      <H2>Three questions</H2>
      <P>Before anything moves, I try to answer these:</P>
      <List>
        <Li>
          Where did it come from? A menu should grow out of the button that
          opened it, not fade in from nowhere.
        </Li>
        <Li>
          Where did it go? Dismissed things should leave in a direction that
          suggests you can get them back.
        </Li>
        <Li>
          What changed? When a value updates, the motion should pull the eye to
          the difference, not the whole component.
        </Li>
      </List>

      <H2>Fast out, gentle in</H2>
      <P>
        Once something has earned its motion, the curve does most of the work. I
        reach for a strong ease-out almost everywhere: it answers the input
        straight away, then takes its time to settle.
      </P>

      <CodeSample
        caption="The curve behind the dock. Quick to start, soft to land, and out of the way for reduced motion."
        code={`
.dock-item {
  transition: background-color 150ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (prefers-reduced-motion: reduce) {
  .dock-item {
    transition: none;
  }
}
`}
        lang="css"
      />

      <P>
        And keep it short. Anything you&apos;ll see a hundred times a day should
        be done in under 200ms. Save the longer, more expressive moments for
        things that happen once.
      </P>
    </>
  );
}

export const post: Essay = {
  Body,
  description:
    "A rule of thumb for interface animation: if it doesn't tell you where something came from or went, cut it.",
  publishedAt: "2026-07-18",
  slug: "motion-should-explain",
  title: "Motion should explain, not decorate",
};

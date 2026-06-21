# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into this Next.js App Router portfolio site. PostHog is initialized via `instrumentation-client.ts` (the Next.js 15.3+ recommended approach), a reverse proxy is configured in `next.config.ts` to route analytics through `/ingest`, and three meaningful user interaction events are captured across the site.

| Event name | Description | File |
|---|---|---|
| `project_link_clicked` | User clicks a project card to visit an external project site. | `app/page.tsx` |
| `work_with_me_cta_clicked` | User clicks the "Jump on a call" button in the work-with-me CTA section. | `components/WorkWithMeCta.tsx` |
| `experiment_card_clicked` | User clicks an experiment card to navigate to the experiment detail page. | `components/NewExperimentCta.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) dashboard](https://us.posthog.com/project/479710/dashboard/1741055)
- [Overall site engagement over time](https://us.posthog.com/project/479710/insights/n8WvQgbI)
- [Experiment card clicks by experiment](https://us.posthog.com/project/479710/insights/VePxlWgj)
- [Project link clicks by project](https://us.posthog.com/project/479710/insights/JuKrdFc2)
- [Work with me CTA clicks](https://us.posthog.com/project/479710/insights/Gs3UJp6e)

## Verify before merging

- [ ] Run a full production build (`pnpm build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

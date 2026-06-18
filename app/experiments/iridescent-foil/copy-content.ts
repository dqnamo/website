const TITLE = "Iridescent Foil";
const DESCRIPTION =
  "Holographic foil built from layered CSS gradients. Scroll the page and move your pointer to shift the iridescent colour and specular glare across the sticker.";

export function buildAgentPrompt(tsxSource: string, cssSource: string) {
  return `Implement an iridescent foil UI component in React.

${DESCRIPTION}

Create these two files:

## IridescentFoil.tsx

\`\`\`tsx
${tsxSource}
\`\`\`

## IridescentFoil.module.css

\`\`\`css
${cssSource}
\`\`\`

The component should:
- Wrap arbitrary children with layered CSS gradient foil, film, pearl, shine, and glare effects
- Update CSS custom properties (--foil-shift, --pointer-x, etc.) on scroll and pointermove
- Accept scrollProgressMode "element" (scroll progress relative to the element) or "document" (page scroll)
- Use requestAnimationFrame to batch DOM updates
`;
}

export function buildMarkdown(tsxSource: string, cssSource: string) {
  return `# ${TITLE}

${DESCRIPTION}

## IridescentFoil.tsx

\`\`\`tsx
${tsxSource}
\`\`\`

## IridescentFoil.module.css

\`\`\`css
${cssSource}
\`\`\`
`;
}

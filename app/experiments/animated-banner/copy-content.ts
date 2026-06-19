type InstructionTextPart =
  | string
  | {
      href: string;
      label: string;
    };

export const BANNER_DEMO_INSTRUCTIONS = [
  {
    title: "Generate the still",
    text: [
      "Use an image-generation model like ",
      {
        label: "GPT Images 2",
        href: "https://openai.com/index/introducing-chatgpt-images-2-0/",
      },
      ". You can also browse model hosts like ",
      {
        label: "Replicate",
        href: "https://replicate.com/",
      },
      " for other image models. Ask for a wide cinematic banner image with the main subject weighted toward the right so the left side has room for text.",
    ],
  },
  {
    title: "Animate the still",
    text: [
      "Send the still into an image-to-video model like ",
      {
        label: "Grok Imagine",
        href: "https://grok.com/imagine",
      },
      ". You can also compare other image-to-video models through places like ",
      {
        label: "Replicate",
        href: "https://replicate.com/",
      },
      ". Generate a short seamless clip, around three to five seconds, with subtle motion rather than a dramatic scene change.",
    ],
  },
  {
    title: "Export the assets",
    text: "Save the still as a JPG or WebP poster and the animation as a muted MP4. Put both files in public paths that the component can reference directly.",
  },
  {
    title: "Optimize for the web",
    text: "Resize the poster to the largest size the banner actually needs, strip metadata, and compress it. Re-encode the video to a small H.264 MP4, trim it to only a few seconds, and keep the file comfortably under a few megabytes.",
  },
  {
    title: "Create the banner frame",
    text: "Build a relative, overflow-hidden link or div with a stable rounded surface. Place the video absolutely inside it with inset-0, h-full, w-full, object-cover, muted, loop, playsInline, and the poster image as fallback.",
  },
  {
    title: "Add the overlay",
    text: "Add a gradient overlay div above the video. Use a CSS variable for the overlay color, then fade from a solid color on the text side to transparent over the image side.",
  },
  {
    title: "Add interaction depth",
    text: "Add a second hover and focus overlay if you want the text side to become stronger when the banner is interactive.",
  },
  {
    title: "Compose the content",
    text: "Place the content in a relative z-index layer above the overlays. Keep the title, balanced subtitle, CTA, and timer in a flex row so the text and timer stay aligned.",
  },
  {
    title: "Check responsiveness",
    text: "Use width constraints on the subtitle and banner container. Test desktop and mobile widths to make sure the timer and text do not overlap.",
  },
] as const satisfies readonly {
  title: string;
  text: string | readonly InstructionTextPart[];
}[];

export function instructionToPlainText(
  text: string | readonly InstructionTextPart[],
) {
  if (typeof text === "string") {
    return text;
  }

  return text
    .map((part) =>
      typeof part === "string" ? part : `${part.label} (${part.href})`,
    )
    .join("");
}

export const BANNER_DEMO_COPY = BANNER_DEMO_INSTRUCTIONS.map(
  (instruction, index) =>
    `${index + 1}. ${instruction.title}\n${instructionToPlainText(instruction.text)}`,
).join("\n");

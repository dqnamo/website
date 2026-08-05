export const usageSource = `import { CassettePlayer } from "@/components/CassettePlayer";

const captionTracks = [
  {
    default: true,
    label: "English",
    src: "/audio/one-small-step.vtt",
    srcLang: "en",
  },
] as const;

export function AudioPlayer() {
  return (
    <CassettePlayer
      audioSrc="/audio/one-small-step.mp3"
      captionTracks={captionTracks}
      trackTitle="One Small Step"
    />
  );
}`;

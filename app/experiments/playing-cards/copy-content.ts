export const usageSource = `import { PlayingCard } from "./PlayingCard";

export function Example() {
  return (
    <div className="flex items-end gap-2">
      <PlayingCard rank="A" suit="spades" />
      <PlayingCard rank="K" suit="hearts" />
      <PlayingCard rank="Q" suit="clubs" />
      <PlayingCard rank="J" suit="diamonds" />
      <PlayingCard rank="10" suit="spades" />
    </div>
  );
}
`;

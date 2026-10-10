export const usageSource = `import { ScrollFade } from "./ScrollFade";

const teams = [
  { flag: "🇿🇦", name: "South Africa" },
  { flag: "🇨🇦", name: "Canada" },
  { flag: "🇧🇷", name: "Brazil" },
];

// Put borders and rounding on a wrapper. The fade doesn't need to know
// what's behind it, so the wrapper can be any colour, gradient, or glass.
export function TeamList() {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <ScrollFade className="h-80 p-2">
        <ul>
          {teams.map((team) => (
            <li className="flex items-center gap-2 px-3 py-2" key={team.name}>
              <span aria-hidden="true">{team.flag}</span>
              {team.name}
            </li>
          ))}
        </ul>
      </ScrollFade>
    </div>
  );
}

export function TeamChips() {
  return (
    <ScrollFade axis="x" className="[scrollbar-width:none]" size={48}>
      <ul className="flex w-max gap-1.5">
        {teams.map((team) => (
          <li key={team.name}>
            <button className="rounded-full border px-3 py-1" type="button">
              {team.flag} {team.name}
            </button>
          </li>
        ))}
      </ul>
    </ScrollFade>
  );
}
`;

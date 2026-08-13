import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { TactileButton } from "@/components/TactileButton";

export function TactileButtonShowcase() {
  return (
    <div className="flex min-h-80 w-full items-center justify-center rounded-[13px] bg-grayscale-2">
      <TactileButton size="sm">
        <span>Continue</span>
        <ArrowRightIcon aria-hidden="true" size={14} weight="bold" />
      </TactileButton>
    </div>
  );
}

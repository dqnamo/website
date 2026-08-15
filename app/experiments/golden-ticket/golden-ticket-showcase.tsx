import { GoldenTicket } from "@/components/GoldenTicket";

export function GoldenTicketShowcase() {
  return (
    <div className="relative flex min-h-[31rem] w-full items-center justify-center overflow-hidden rounded-[13px] bg-[#160f08] px-5 py-16 sm:px-10">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(199, 135, 30, 0.22), transparent 42%), radial-gradient(circle at 50% 120%, rgba(122, 25, 15, 0.36), transparent 48%), linear-gradient(135deg, #1d1209, #0b0805)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[url('/textures/plastic-noise.svg')] opacity-25 mix-blend-soft-light"
      />
      <GoldenTicket
        className="z-[1] w-full max-w-[40rem]"
        date="Saturday, 17 October · 8PM"
        eventName="The Golden Hour"
        invitee="Reserved for JP"
        venue="The Orangery · London"
      />
    </div>
  );
}

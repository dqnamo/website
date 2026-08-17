import { GoldenTicket } from "@/components/GoldenTicket";

export function GoldenTicketShowcase() {
  return (
    <div className="flex min-h-[31rem] w-full items-center justify-center overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 px-5 py-16 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none sm:px-10">
      <GoldenTicket className="w-full max-w-[40rem]" />
    </div>
  );
}

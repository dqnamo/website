export const usageSource = `import { WaitlistTicket } from "@/components/WaitlistTicket";

export function ProductWaitlist() {
  return (
    <WaitlistTicket
      onJoin={async (email) => {
        const response = await fetch("/api/waitlist", {
          body: JSON.stringify({ email }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("We couldn't add you. Please try again.");
        }

        return response.json();
      }}
    />
  );
}`;

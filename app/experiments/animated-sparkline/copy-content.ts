export const usageSource = `import { Sparkline } from "@/components/Sparkline";

const data = [
  { label: "Jan", value: 42 },
  { label: "Feb", value: 47 },
  { label: "Mar", value: 44 },
  { label: "Apr", value: 53 },
  { label: "May", value: 57 },
  { label: "Jun", value: 63 },
  { label: "Jul", value: 61 },
  { label: "Aug", value: 72 },
];

export function SparklineExample() {
  return (
    <div className="w-64 text-green-9">
      <Sparkline
        ariaLabel="Revenue trend up"
        data={data}
        glow
        showEndpoint
      />
    </div>
  );
}
`;

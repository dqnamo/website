export const usageSource = `import { MagneticDropZone } from "@/components/MagneticDropZone";

export function UploadField() {
  return (
    <MagneticDropZone
      accept="image/*,.pdf,.zip"
      maxSize={20 * 1024 * 1024}
      onFilesChange={(files) => {
        console.log(files);
      }}
    />
  );
}`;

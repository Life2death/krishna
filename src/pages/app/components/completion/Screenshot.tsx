import { Button } from "@/components";
import { LaptopMinimalIcon, Loader2 } from "lucide-react";
import { MAX_FILES } from "@/config";
import { useApp } from "@/contexts";
import { useKrishna } from "@/hooks";

export const Screenshot = () => {
  const { supportsImages } = useApp();
  const krishna = useKrishna();
  const isBusy = krishna.status !== "idle";

  const isDisabled =
    krishna.attachedFiles.length >= MAX_FILES ||
    isBusy ||
    krishna.isScreenshotLoading ||
    !supportsImages;

  return (
    <Button
      size="icon"
      className="cursor-pointer"
      title={
        !supportsImages
          ? "Screenshot not supported by current AI provider"
          : `Screenshot - ${krishna.attachedFiles.length}/${MAX_FILES} files`
      }
      onClick={krishna.captureScreenshot}
      disabled={isDisabled}
    >
      {krishna.isScreenshotLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LaptopMinimalIcon className="h-4 w-4" />
      )}
    </Button>
  );
};

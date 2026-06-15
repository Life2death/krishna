import { useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button, ScrollArea } from "@/components";
import { PaperclipIcon, XIcon, PlusIcon } from "lucide-react";
import { MAX_FILES } from "@/config";
import { useApp } from "@/contexts";
import { useKrishna } from "@/hooks";

export const Files = () => {
  const { supportsImages } = useApp();
  const krishna = useKrishna();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFilesPopoverOpen, setIsFilesPopoverOpen] = useState(false);
  const isBusy = krishna.status !== "idle";

  const handleAddMoreClick = () => {
    fileInputRef.current?.click();
  };

  const canAddMore = krishna.attachedFiles.length < MAX_FILES;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await krishna.addFile(file);
    }
    e.target.value = "";
  };

  return (
    <div className="relative">
      <Popover open={isFilesPopoverOpen} onOpenChange={setIsFilesPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            onClick={() => {
              if (krishna.attachedFiles.length === 0) {
                fileInputRef.current?.click();
              } else {
                setIsFilesPopoverOpen(true);
              }
            }}
            disabled={isBusy || !supportsImages}
            className="cursor-pointer"
            title={
              supportsImages
                ? "Attach images"
                : "Image upload not supported by current AI provider"
            }
          >
            <PaperclipIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>

        {/* File count badge */}
        {krishna.attachedFiles.length > 0 && (
          <div className="absolute -top-2 -right-2 bg-primary-foreground text-primary rounded-full h-5 w-5 flex border border-primary items-center justify-center text-xs font-medium">
            {krishna.attachedFiles.length}
          </div>
        )}

        {krishna.attachedFiles.length > 0 && (
          <PopoverContent
            align="end"
            side="bottom"
            className="w-screen p-0 border shadow-lg overflow-hidden"
            sideOffset={8}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm select-none">
                Attached Images ({krishna.attachedFiles.length}/{MAX_FILES})
              </h3>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsFilesPopoverOpen(false)}
                className="cursor-pointer"
                title="Close"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="p-4 h-[calc(100vh-11rem)]">
              <div
                className={`gap-3 ${
                  krishna.attachedFiles.length <= 2
                    ? "flex flex-col"
                    : "grid grid-cols-2"
                }`}
              >
                {krishna.attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="relative group border rounded-lg overflow-hidden bg-muted/20"
                  >
                    <img
                      src={`data:${file.type};base64,${file.base64}`}
                      alt={file.name}
                      className="w-full object-cover h-full"
                    />

                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 text-xs">
                      <div className="truncate font-medium">{file.name}</div>
                      <div className="text-gray-300">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>

                    <Button
                      size="icon"
                      variant="default"
                      className="absolute top-2 right-2 h-6 w-6 cursor-pointer"
                      onClick={() => krishna.removeFile(file.id)}
                      title="Remove image"
                    >
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="sticky bottom-0 border-t bg-background p-3 flex flex-row gap-2">
              <Button
                onClick={handleAddMoreClick}
                disabled={!canAddMore || isBusy}
                className="w-full"
                variant="outline"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add More Images {!canAddMore && `(${MAX_FILES} max)`}
              </Button>
              <Button
                className="w-full"
                variant="destructive"
                onClick={krishna.clearFiles}
              >
                Remove All
              </Button>
            </div>
          </PopoverContent>
        )}
      </Popover>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

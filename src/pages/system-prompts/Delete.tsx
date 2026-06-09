import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from "@/components";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

interface DeleteSystemPromptProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  promptId: number | undefined;
  promptName: string;
  onDelete: (id: number) => Promise<void>;
  isActivePrompt: boolean;
}

export const DeleteSystemPrompt = ({
  isOpen,
  onOpenChange,
  promptId,
  promptName,
  onDelete,
  isActivePrompt,
}: DeleteSystemPromptProps) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!promptId) return;

    try {
      setIsDeleting(true);
      await onDelete(promptId);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to delete system prompt:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <DialogTitle>Delete System Prompt</DialogTitle>
              <DialogDescription className="mt-1">
                Are you sure you want to delete "{promptName}"?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="py-3 space-y-3">
          {isActivePrompt && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                This is your active prompt. Deleting it will reset the AI behavior
                to the default system prompt.
              </p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. This will permanently delete the
            system prompt from the database.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Series } from "@/types/series";

interface DeleteSeriesDialogProps {
  series: Series | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteSeriesDialog({ series, onClose, onConfirm }: DeleteSeriesDialogProps) {
  if (!series) return null;

  return (
    <Dialog open={!!series} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete Series</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{series.title}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Deleting this series will remove it from your collection, but the stories in the series will not be deleted.
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
          >
            Delete Series
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 
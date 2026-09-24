import React, { useEffect } from 'react';
import { Zap } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Textarea } from '@client/src/components/ui/textarea';

const REBUILD_COST = 10;

interface EditDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDescription: string;
  hasCredits: boolean;
  onConfirm: (description: string) => void;
}

const EditDescriptionDialog: React.FC<EditDescriptionDialogProps> = ({
  open,
  onOpenChange,
  initialDescription,
  hasCredits,
  onConfirm,
}) => {
  const [description, setDescription] = React.useState(initialDescription);

  useEffect(() => {
    if (open) {
      setDescription(initialDescription);
    }
  }, [open, initialDescription]);

  const handleConfirm = () => {
    const trimmed = description.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>编辑描述并重新生成</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述你想要的应用..."
            className="min-h-[120px]"
          />
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-violet-500" />
            重新生成将消耗 {REBUILD_COST} Credits
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!description.trim() || !hasCredits}
          >
            重新生成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditDescriptionDialog;

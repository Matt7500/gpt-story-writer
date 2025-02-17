
import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AISettingsProps {
  userId: string;
  openAIKey: string;
  openAIModel: string;
  reasoningModel: string;
  titleFineTuneModel: string;
  rewritingModel: string;
  onOpenAIKeyChange: (key: string) => void;
  onOpenAIModelChange: (model: string) => void;
  onReasoningModelChange: (model: string) => void;
  onTitleFineTuneModelChange: (model: string) => void;
  onRewritingModelChange: (model: string) => void;
}

export function AISettings({
  userId,
  openAIKey,
  openAIModel,
  reasoningModel,
  titleFineTuneModel,
  rewritingModel,
  onOpenAIKeyChange,
  onOpenAIModelChange,
  onReasoningModelChange,
  onTitleFineTuneModelChange,
  onRewritingModelChange,
}: AISettingsProps) {
  const { toast } = useToast();

  const handleSaveAISettings = async () => {
    try {
      const { error } = await supabase
        .from("user_settings")
        .update({ 
          openai_model: openAIModel,
          openai_key: openAIKey,
          reasoning_model: reasoningModel,
          title_fine_tune_model: titleFineTuneModel,
          rewriting_model: rewritingModel
        })
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "AI settings updated successfully",
      });
    } catch (error) {
      console.error("Error updating AI settings:", error);
      toast({
        title: "Error",
        description: "Failed to update AI settings",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Key className="h-5 w-5" />
        <h2 className="text-xl font-medium">AI Settings</h2>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">OpenAI API Key</label>
          <Input
            type="password"
            value={openAIKey}
            onChange={(e) => onOpenAIKeyChange(e.target.value)}
            placeholder="Enter your OpenAI API key"
          />
          <p className="text-sm text-muted-foreground">
            Your API key is stored securely and never shared.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Story Generation Model</label>
          <Input
            value={openAIModel}
            onChange={(e) => onOpenAIModelChange(e.target.value)}
            placeholder="Enter model name (e.g., gpt-4o-mini)"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Reasoning Model</label>
          <Input
            value={reasoningModel}
            onChange={(e) => onReasoningModelChange(e.target.value)}
            placeholder="Enter model name (e.g., llama-3.1-sonar-small-128k-online)"
          />
          <p className="text-sm text-muted-foreground">
            Used for analyzing and reasoning about your stories.
          </p>
        </div>

        <Separator className="my-4" />
        <h3 className="text-lg font-medium mb-4">Fine-Tune Models</h3>

        <div className="space-y-2">
          <label className="text-sm font-medium">Title Generation Model</label>
          <Input
            value={titleFineTuneModel}
            onChange={(e) => onTitleFineTuneModelChange(e.target.value)}
            placeholder="Enter fine-tuned model for titles"
          />
          <p className="text-sm text-muted-foreground">
            Custom model for generating story titles.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Rewriting Model</label>
          <Input
            value={rewritingModel}
            onChange={(e) => onRewritingModelChange(e.target.value)}
            placeholder="Enter fine-tuned model for rewriting"
          />
          <p className="text-sm text-muted-foreground">
            Custom model for rewriting and refining story content.
          </p>
        </div>

        <Button onClick={handleSaveAISettings}>Save AI Settings</Button>
      </div>
    </div>
  );
}

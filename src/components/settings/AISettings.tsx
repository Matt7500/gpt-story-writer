import { useEffect, useState } from "react";
import { Key, Mic, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoiceModel {
  model_id: string;
  display_name: string;
  description?: string;
}

interface AISettingsProps {
  userId: string;
  openAIKey: string;
  openAIModel: string;
  reasoningModel: string;
  titleFineTuneModel: string;
  rewritingModel: string;
  elevenLabsKey: string;
  elevenLabsModel: string;
  elevenLabsVoiceId: string;
  replicateKey: string;
  onOpenAIKeyChange: (key: string) => void;
  onOpenAIModelChange: (model: string) => void;
  onReasoningModelChange: (model: string) => void;
  onTitleFineTuneModelChange: (model: string) => void;
  onRewritingModelChange: (model: string) => void;
  onElevenLabsKeyChange: (key: string) => void;
  onElevenLabsModelChange: (model: string) => void;
  onElevenLabsVoiceIdChange: (voiceId: string) => void;
  onReplicateKeyChange: (key: string) => void;
}

export function AISettings({
  userId,
  openAIKey,
  openAIModel,
  reasoningModel,
  titleFineTuneModel,
  rewritingModel,
  elevenLabsKey,
  elevenLabsModel,
  elevenLabsVoiceId,
  replicateKey,
  onOpenAIKeyChange,
  onOpenAIModelChange,
  onReasoningModelChange,
  onTitleFineTuneModelChange,
  onRewritingModelChange,
  onElevenLabsKeyChange,
  onElevenLabsModelChange,
  onElevenLabsVoiceIdChange,
  onReplicateKeyChange,
}: AISettingsProps) {
  const { toast } = useToast();
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    async function fetchVoiceModels() {
      if (!elevenLabsKey) return;
      
      setLoadingModels(true);
      try {
        const response = await fetch('https://api.elevenlabs.io/v1/models', {
          headers: {
            'Accept': 'application/json',
            'xi-api-key': elevenLabsKey
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch voice models');
        }

        const data = await response.json();
        setVoiceModels(data.map((model: any) => ({
          model_id: model.model_id,
          display_name: model.name,
          description: model.description
        })));
      } catch (error) {
        console.error('Error fetching voice models:', error);
        toast({
          title: "Error",
          description: "Failed to fetch voice models. Please check your API key.",
          variant: "destructive",
        });
      } finally {
        setLoadingModels(false);
      }
    }

    if (elevenLabsKey) {
      fetchVoiceModels();
    }
  }, [elevenLabsKey, toast]);

  const handleSaveAISettings = async () => {
    try {
      const { error } = await supabase
        .from("user_settings")
        .update({ 
          openai_model: openAIModel,
          openai_key: openAIKey,
          reasoning_model: reasoningModel,
          title_fine_tune_model: titleFineTuneModel,
          rewriting_model: rewritingModel,
          elevenlabs_key: elevenLabsKey,
          elevenlabs_model: elevenLabsModel,
          elevenlabs_voice_id: elevenLabsVoiceId,
          replicate_key: replicateKey
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

      {/* OpenAI Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">OpenAI Settings</h3>
        <div className="space-y-2">
          <label className="text-sm font-medium">OpenAI API Key</label>
          <Input
            type="password"
            value={openAIKey}
            onChange={(e) => onOpenAIKeyChange(e.target.value)}
            placeholder="Enter your OpenAI API key"
          />
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
            placeholder="Enter model name"
          />
        </div>
      </div>

      <Separator />

      {/* ElevenLabs Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          <h3 className="text-lg font-medium">Text to Speech Settings</h3>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">ElevenLabs API Key</label>
          <Input
            type="password"
            value={elevenLabsKey}
            onChange={(e) => onElevenLabsKeyChange(e.target.value)}
            placeholder="Enter your ElevenLabs API key"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Voice Model</label>
          <Select 
            value={elevenLabsModel} 
            onValueChange={onElevenLabsModelChange}
            disabled={loadingModels || !elevenLabsKey}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingModels ? "Loading models..." : "Select a model"} />
            </SelectTrigger>
            <SelectContent>
              {voiceModels.map((model) => (
                <SelectItem 
                  key={model.model_id} 
                  value={model.model_id}
                >
                  {model.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!elevenLabsKey && (
            <p className="text-sm text-muted-foreground">
              Enter your API key to see available models
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Voice ID</label>
          <Select value={elevenLabsVoiceId} onValueChange={onElevenLabsVoiceIdChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="21m00Tcm4TlvDq8ikWAM">Rachel</SelectItem>
              <SelectItem value="AZnzlk1XvdvUeBnXmlld">Domi</SelectItem>
              <SelectItem value="EXAVITQu4vr4xnSDxMaL">Bella</SelectItem>
              <SelectItem value="ErXwobaYiN019PkySvjV">Antoni</SelectItem>
              <SelectItem value="MF3mGyEYCl7XYWbV9V6O">Elli</SelectItem>
              <SelectItem value="TxGEqnHWrfWFTfGW9XjX">Josh</SelectItem>
              <SelectItem value="VR6AewLTigWG4xSOukaG">Arnold</SelectItem>
              <SelectItem value="pNInz6obpgDQGcFmaJgB">Adam</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Replicate Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          <h3 className="text-lg font-medium">Image Generation Settings</h3>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Replicate API Key</label>
          <Input
            type="password"
            value={replicateKey}
            onChange={(e) => onReplicateKeyChange(e.target.value)}
            placeholder="Enter your Replicate API key"
          />
        </div>
      </div>

      <Button onClick={handleSaveAISettings}>Save AI Settings</Button>
    </div>
  );
}

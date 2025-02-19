import { useEffect, useState } from "react";
import { Key, Mic, Image, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VoiceModel {
  model_id: string;
  display_name: string;
  description?: string;
}

interface APIKeyValidation {
  isValid: boolean;
  message: string;
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

const API_KEY_PATTERNS = {
  openai: /^sk-proj-[A-Za-z0-9_-]+$/,
  elevenlabs: /^sk_[A-Za-z0-9]{48}$/,
  replicate: /^r8_[A-Za-z0-9]{37}$/
};

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
  const [editingKeys, setEditingKeys] = useState<Record<string, boolean>>({
    openai: false,
    elevenlabs: false,
    replicate: false
  });
  const [keyValidation, setKeyValidation] = useState<Record<string, APIKeyValidation>>({
    openai: { isValid: false, message: "" },
    elevenlabs: { isValid: false, message: "" },
    replicate: { isValid: false, message: "" }
  });

  const validateKey = (key: string, type: 'openai' | 'elevenlabs' | 'replicate'): APIKeyValidation => {
    if (!key) return { isValid: false, message: "" };
    if (!editingKeys[type]) return { isValid: true, message: "" };
    
    const pattern = API_KEY_PATTERNS[type];
    const isValid = pattern.test(key);
    
    return {
      isValid,
      message: isValid ? "Valid API key format" : "Invalid API key format"
    };
  };

  useEffect(() => {
    setKeyValidation({
      openai: validateKey(openAIKey, 'openai'),
      elevenlabs: validateKey(elevenLabsKey, 'elevenlabs'),
      replicate: validateKey(replicateKey, 'replicate')
    });
  }, [openAIKey, elevenLabsKey, replicateKey, editingKeys]);

  const handleKeyChange = (value: string, type: 'openai' | 'elevenlabs' | 'replicate') => {
    setEditingKeys(prev => ({ ...prev, [type]: true }));
    switch (type) {
      case 'openai':
        onOpenAIKeyChange(value);
        break;
      case 'elevenlabs':
        onElevenLabsKeyChange(value);
        break;
      case 'replicate':
        onReplicateKeyChange(value);
        break;
    }
  };

  useEffect(() => {
    async function fetchVoiceModels() {
      if (!elevenLabsKey || !keyValidation.elevenlabs.isValid) return;
      
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
  }, [elevenLabsKey, keyValidation.elevenlabs.isValid, toast]);

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

      // Reset editing state after successful save
      setEditingKeys({
        openai: false,
        elevenlabs: false,
        replicate: false
      });

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

  const ValidationIcon = ({ isValid, message }: { isValid: boolean, message: string }) => {
    if (!message) return null;
    return isValid ? 
      <Check className="h-4 w-4 text-green-500" /> : 
      <X className="h-4 w-4 text-red-500" />;
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
          <div className="relative">
            <Input
              type="password"
              value={openAIKey}
              onChange={(e) => handleKeyChange(e.target.value, 'openai')}
              placeholder="sk-proj-..."
              className={cn(
                "pr-8",
                editingKeys.openai && keyValidation.openai.message && (
                  keyValidation.openai.isValid ? "border-green-500" : "border-red-500"
                )
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {editingKeys.openai && <ValidationIcon {...keyValidation.openai} />}
            </div>
          </div>
          {editingKeys.openai && keyValidation.openai.message && (
            <p className={cn(
              "text-xs",
              keyValidation.openai.isValid ? "text-green-500" : "text-red-500"
            )}>
              {keyValidation.openai.message}
            </p>
          )}
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
          <div className="relative">
            <Input
              type="password"
              value={elevenLabsKey}
              onChange={(e) => handleKeyChange(e.target.value, 'elevenlabs')}
              placeholder="Enter your ElevenLabs API key"
              className={cn(
                "pr-8",
                editingKeys.elevenlabs && keyValidation.elevenlabs.message && (
                  keyValidation.elevenlabs.isValid ? "border-green-500" : "border-red-500"
                )
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {editingKeys.elevenlabs && <ValidationIcon {...keyValidation.elevenlabs} />}
            </div>
          </div>
          {editingKeys.elevenlabs && keyValidation.elevenlabs.message && (
            <p className={cn(
              "text-xs",
              keyValidation.elevenlabs.isValid ? "text-green-500" : "text-red-500"
            )}>
              {keyValidation.elevenlabs.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Voice Model</label>
          <Select 
            value={elevenLabsModel} 
            onValueChange={onElevenLabsModelChange}
            disabled={loadingModels || !elevenLabsKey || !keyValidation.elevenlabs.isValid}
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
          <Select 
            value={elevenLabsVoiceId} 
            onValueChange={onElevenLabsVoiceIdChange}
            disabled={!keyValidation.elevenlabs.isValid}
          >
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
          <div className="relative">
            <Input
              type="password"
              value={replicateKey}
              onChange={(e) => handleKeyChange(e.target.value, 'replicate')}
              placeholder="r8_..."
              className={cn(
                "pr-8",
                editingKeys.replicate && keyValidation.replicate.message && (
                  keyValidation.replicate.isValid ? "border-green-500" : "border-red-500"
                )
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {editingKeys.replicate && <ValidationIcon {...keyValidation.replicate} />}
            </div>
          </div>
          {editingKeys.replicate && keyValidation.replicate.message && (
            <p className={cn(
              "text-xs",
              keyValidation.replicate.isValid ? "text-green-500" : "text-red-500"
            )}>
              {keyValidation.replicate.message}
            </p>
          )}
        </div>
      </div>

      <Button 
        onClick={handleSaveAISettings}
        disabled={!keyValidation.openai.isValid && !keyValidation.elevenlabs.isValid && !keyValidation.replicate.isValid}
      >
        Save AI Settings
      </Button>
    </div>
  );
}

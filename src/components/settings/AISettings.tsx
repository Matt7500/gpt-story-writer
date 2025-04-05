import { useEffect, useState } from "react";
import { Key, Mic, Image, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { userSettingsService } from "@/services/UserSettingsService";
import { FontManagement } from "./FontManagement";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { UserSettings } from "@/types/settings";

interface VoiceModel {
  model_id: string;
  display_name: string;
  description?: string;
}

interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
}

interface APIKeyValidation {
  isValid: boolean;
  message: string;
}

interface ModelValidation {
  isValid: boolean;
  message: string;
}

interface AISettingsProps {
  userId: string;
  openAIKey: string;
  openai_key: string;
  openAIModel: string;
  reasoningModel: string;
  titleFineTuneModel: string;
  rewritingModel: string;
  rewriteModel: string;
  storyGenerationModel: string;
  useOpenAIForStoryGen: boolean;
  elevenLabsKey: string;
  elevenLabsModel: string;
  elevenLabsVoiceId: string;
  replicateKey: string;
  voiceStability: number;
  voiceSimilarityBoost: number;
  voiceStyle: number;
  voiceSpeakerBoost: boolean;
  minChapters?: number;
  maxChapters?: number;
  onOpenAIKeyChange: (key: string) => void;
  onOpenaiKeyChange: (key: string) => void;
  onOpenAIModelChange: (model: string) => void;
  onReasoningModelChange: (model: string) => void;
  onTitleFineTuneModelChange: (model: string) => void;
  onRewritingModelChange: (model: string) => void;
  onRewriteModelChange: (model: string) => void;
  onStoryGenerationModelChange: (model: string) => void;
  onUseOpenAIForStoryGenChange: (useOpenAI: boolean) => void;
  onElevenLabsKeyChange: (key: string) => void;
  onElevenLabsModelChange: (model: string) => void;
  onElevenLabsVoiceIdChange: (voiceId: string) => void;
  onReplicateKeyChange: (key: string) => void;
  onVoiceStabilityChange: (stability: number) => void;
  onVoiceSimilarityBoostChange: (similarityBoost: number) => void;
  onVoiceStyleChange: (style: number) => void;
  onVoiceSpeakerBoostChange: (speakerBoost: boolean) => void;
  onMinChaptersChange: (value: number) => void;
  onMaxChaptersChange: (value: number) => void;
}

const API_KEY_PATTERNS = {
  openai: /^sk-proj-[A-Za-z0-9_]{156}$/,
  openrouter: /^sk-or-v1-[A-Za-z0-9]{64}$/,
  elevenlabs: /^sk_[A-Za-z0-9]{48}$/,
  replicate: /^r8_[A-Za-z0-9]{37}$/
};

const OPENAI_MODEL_PATTERN = /^gpt-/;
const OPENROUTER_MODEL_PATTERN = /\//;
const REASONING_MODEL_PATTERN = /^o|\/|^llama/;

export function AISettings({
  userId,
  openAIKey,
  openai_key,
  openAIModel,
  reasoningModel,
  titleFineTuneModel,
  rewritingModel,
  rewriteModel,
  storyGenerationModel,
  useOpenAIForStoryGen,
  elevenLabsKey,
  elevenLabsModel,
  elevenLabsVoiceId,
  replicateKey,
  voiceStability,
  voiceSimilarityBoost,
  voiceStyle,
  voiceSpeakerBoost,
  minChapters: initialMinChapters,
  maxChapters: initialMaxChapters,
  onOpenAIKeyChange,
  onOpenaiKeyChange,
  onOpenAIModelChange,
  onReasoningModelChange,
  onTitleFineTuneModelChange,
  onRewritingModelChange,
  onRewriteModelChange,
  onStoryGenerationModelChange,
  onUseOpenAIForStoryGenChange,
  onElevenLabsKeyChange,
  onElevenLabsModelChange,
  onElevenLabsVoiceIdChange,
  onReplicateKeyChange,
  onVoiceStabilityChange,
  onVoiceSimilarityBoostChange,
  onVoiceStyleChange,
  onVoiceSpeakerBoostChange,
  onMinChaptersChange,
  onMaxChaptersChange,
}: AISettingsProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [stability, setStability] = useState(voiceStability);
  const [similarityBoost, setSimilarityBoost] = useState(voiceSimilarityBoost);
  const [voiceStyleState, setVoiceStyleState] = useState(voiceStyle);
  const [speakerBoostState, setSpeakerBoostState] = useState(voiceSpeakerBoost);
  const [editingKeys, setEditingKeys] = useState<Record<string, boolean>>({
    openai: false,
    openrouter: false,
    elevenlabs: false,
    replicate: false
  });
  const [keyValidation, setKeyValidation] = useState<Record<string, APIKeyValidation>>({
    openai: { isValid: false, message: "" },
    openrouter: { isValid: false, message: "" },
    elevenlabs: { isValid: false, message: "" },
    replicate: { isValid: false, message: "" }
  });
  const [modelValidation, setModelValidation] = useState<ModelValidation>({
    isValid: true,
    message: ""
  });
  const [reasoningModelValidation, setReasoningModelValidation] = useState<ModelValidation>({
    isValid: true,
    message: ""
  });
  const [isEditingStoryModel, setIsEditingStoryModel] = useState(false);
  const [isEditingReasoningModel, setIsEditingReasoningModel] = useState(false);

  const [minChapters, setMinChapters] = useState<number>(initialMinChapters ?? 5);
  const [maxChapters, setMaxChapters] = useState<number>(initialMaxChapters ?? 7);
  const [chapterRangeError, setChapterRangeError] = useState<string | null>(null);

  useEffect(() => {
    setMinChapters(initialMinChapters ?? 5);
  }, [initialMinChapters]);

  useEffect(() => {
    setMaxChapters(initialMaxChapters ?? 7);
  }, [initialMaxChapters]);

  useEffect(() => {
    if (minChapters < 3 || maxChapters > 15) {
      setChapterRangeError("Chapters must be between 3 and 15.");
    } else if (minChapters > maxChapters) {
      setChapterRangeError("Minimum chapters cannot be greater than maximum chapters.");
    } else {
      setChapterRangeError(null);
    }
  }, [minChapters, maxChapters]);

  const validateKey = (key: string, type: 'openai' | 'openrouter' | 'elevenlabs' | 'replicate'): APIKeyValidation => {
    if (!key) return { isValid: false, message: "" };
    if (!editingKeys[type]) return { isValid: true, message: "" };
    
    const pattern = API_KEY_PATTERNS[type];
    const isValid = pattern.test(key);
    
    return {
      isValid,
      message: isValid ? "Valid API key format" : "Invalid API key format"
    };
  };

  const validateModel = (model: string, isOpenAI: boolean): ModelValidation => {
    if (!model) return { isValid: false, message: "Model name is required" };
    
    if (isOpenAI) {
      const isValid = OPENAI_MODEL_PATTERN.test(model);
      return {
        isValid,
        message: isValid ? 
          "Valid OpenAI model format" : 
          "Invalid OpenAI model format. Should start with 'gpt-'"
      };
    } else {
      const isValid = OPENROUTER_MODEL_PATTERN.test(model);
      return {
        isValid,
        message: isValid ? 
          "Valid OpenRouter model format" : 
          "Invalid OpenRouter model format. Should include a provider prefix like 'openai/gpt-4' or 'anthropic/claude-3'"
      };
    }
  };

  const validateReasoningModel = (model: string, isOpenAI: boolean): ModelValidation => {
    if (!model) return { isValid: false, message: "Model name is required" };
    
    if (isOpenAI) {
      // For OpenAI, model should start with 'o''
      const isValid = /^o/.test(model);
      return {
        isValid,
        message: isValid ? 
          "Valid model format" : 
          "Invalid model format."
      };
    } else {
      // For OpenRouter, model must include a provider prefix (contain '/')
      const isValid = model.includes('/');
      return {
        isValid,
        message: isValid ? 
          "Valid OpenRouter model format" : 
          "Invalid model format. Should include a provider prefix like 'openai/gpt-4'"
      };
    }
  };

  useEffect(() => {
    setKeyValidation({
      openai: validateKey(openai_key, 'openai'),
      openrouter: validateKey(openAIKey, 'openrouter'),
      elevenlabs: validateKey(elevenLabsKey, 'elevenlabs'),
      replicate: validateKey(replicateKey, 'replicate')
    });
  }, [openai_key, openAIKey, elevenLabsKey, replicateKey, editingKeys]);

  useEffect(() => {
    if (isEditingStoryModel) {
      const currentModel = useOpenAIForStoryGen ? storyGenerationModel : openAIModel;
      setModelValidation(validateModel(currentModel, useOpenAIForStoryGen));
    }
  }, [useOpenAIForStoryGen, storyGenerationModel, openAIModel, isEditingStoryModel]);

  useEffect(() => {
    if (isEditingReasoningModel) {
      setReasoningModelValidation(validateReasoningModel(reasoningModel, useOpenAIForStoryGen));
    }
  }, [reasoningModel, isEditingReasoningModel, useOpenAIForStoryGen]);

  const handleKeyChange = (value: string, type: 'openai' | 'openrouter' | 'elevenlabs' | 'replicate') => {
    setEditingKeys(prev => ({ ...prev, [type]: true }));
    switch (type) {
      case 'openai':
        onOpenaiKeyChange(value);
        break;
      case 'openrouter':
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
    
    // Fetch voices from ElevenLabs
    async function fetchVoices() {
      if (!elevenLabsKey || !keyValidation.elevenlabs.isValid) return;
      
      setLoadingVoices(true);
      try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: {
            'Accept': 'application/json',
            'xi-api-key': elevenLabsKey
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch voices');
        }
        
        const data = await response.json();
        // Sort voices alphabetically by name
        const sortedVoices = data.voices
          .map((voice: any) => ({
            voice_id: voice.voice_id,
            name: voice.name,
            preview_url: voice.preview_url
          }))
          .sort((a: Voice, b: Voice) => a.name.localeCompare(b.name));
          
        setVoices(sortedVoices);
      } catch (error) {
        console.error('Error fetching voices:', error);
        toast({
          title: "Error",
          description: "Failed to fetch voices. Please check your API key.",
          variant: "destructive",
        });
      } finally {
        setLoadingVoices(false);
      }
    }
    
    if (elevenLabsKey) {
      fetchVoiceModels();
      fetchVoices();
    }
  }, [elevenLabsKey, keyValidation.elevenlabs.isValid, toast]);

  const handleSaveAISettings = async () => {
    if (chapterRangeError) {
      toast({
        title: "Invalid Settings",
        description: chapterRangeError,
        variant: "destructive",
      });
      return;
    }
    
    setIsSaving(true);
    try {
      const settings: Partial<UserSettings> = {
        openrouter_key: openAIKey,
        openai_key: openai_key,
        openrouter_model: openAIModel,
        reasoning_model: reasoningModel,
        title_fine_tune_model: titleFineTuneModel,
        rewriting_model: rewritingModel,
        rewrite_model: rewriteModel,
        story_generation_model: storyGenerationModel,
        use_openai_for_story_gen: useOpenAIForStoryGen,
        elevenlabs_key: elevenLabsKey,
        elevenlabs_model: elevenLabsModel,
        elevenlabs_voice_id: elevenLabsVoiceId,
        replicate_key: replicateKey,
        voice_stability: stability,
        voice_similarity_boost: similarityBoost,
        voice_style: voiceStyleState,
        voice_speaker_boost: speakerBoostState,
        min_chapters: minChapters,
        max_chapters: maxChapters,
      };
      
      await saveSettings(settings);
      
      toast({
        title: "Settings Saved",
        description: "Your AI settings have been updated successfully.",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper function to save specific settings
  const saveSettings = async (settings: Partial<UserSettings>) => {
    try {
      console.log('Saving settings:', settings);
      await userSettingsService.updateSettings(userId, settings);
      
      toast({
        title: "Settings updated",
        description: "Your AI settings have been updated.",
        duration: 3000,
      });
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const ValidationIcon = ({ isValid, message }: { isValid: boolean, message: string }) => {
    if (!message) return null;
    return isValid ? 
      <Check className="h-4 w-4 text-green-500" /> : 
      <X className="h-4 w-4 text-red-500" />;
  };

  const handleProviderChange = (checked: boolean) => {
    // Set default models if the current ones are empty or invalid
    let currentStoryModel = storyGenerationModel;
    let currentReasoningModel = reasoningModel;
    
    // Default models for each provider
    const defaultOpenAIStoryModel = "gpt-4o";
    const defaultOpenRouterStoryModel = "anthropic/claude-3.7-sonnet:beta";
    const defaultOpenAIReasoningModel = "o3-mini";
    const defaultOpenRouterReasoningModel = "anthropic/claude-3.7-sonnet:thinking";
    
    // If switching to OpenAI and the current model is empty or invalid for OpenAI
    if (checked && (!currentStoryModel || !currentStoryModel.startsWith('gpt-'))) {
      currentStoryModel = defaultOpenAIStoryModel;
      onStoryGenerationModelChange(currentStoryModel);
      console.log('Setting default OpenAI story model:', currentStoryModel);
    }
    
    // If switching to OpenRouter and the current model is empty or doesn't have a provider prefix
    if (!checked && (!currentStoryModel || !currentStoryModel.includes('/'))) {
      currentStoryModel = defaultOpenRouterStoryModel;
      onOpenAIModelChange(currentStoryModel);
      console.log('Setting default OpenRouter story model:', currentStoryModel);
    }
    
    // Same for reasoning model
    if (checked && (!currentReasoningModel || (!currentReasoningModel.startsWith('o') && !currentReasoningModel.startsWith('llama')))) {
      currentReasoningModel = defaultOpenAIReasoningModel;
      onReasoningModelChange(currentReasoningModel);
      console.log('Setting default OpenAI reasoning model:', currentReasoningModel);
    }
    
    if (!checked && (!currentReasoningModel || !currentReasoningModel.includes('/'))) {
      currentReasoningModel = defaultOpenRouterReasoningModel;
      onReasoningModelChange(currentReasoningModel);
      console.log('Setting default OpenRouter reasoning model:', currentReasoningModel);
    }
    
    // Validate both story generation and reasoning models for the new provider
    const storyValidation = validateModel(currentStoryModel, checked);
    const reasoningValidation = validateReasoningModel(currentReasoningModel, checked);
    
    let validationMessages = [];
    
    if (!storyValidation.isValid) {
      validationMessages.push(`Story Generation Model "${currentStoryModel}" is not valid for ${checked ? 'OpenAI' : 'OpenRouter'}. ${checked ? 'OpenAI models should start with "gpt-"' : 'OpenRouter models should include a provider prefix like "openai/gpt-4"'}`);
    }
    
    if (!reasoningValidation.isValid) {
      validationMessages.push(`Reasoning Model "${currentReasoningModel}" is not valid for ${checked ? 'OpenAI' : 'OpenRouter'}. ${checked ? 'Should start with "o" or "llama"' : 'Should include a provider prefix like "openai/gpt-4"'}`);
    }
    
    if (validationMessages.length > 0) {
      toast({
        title: `Invalid Model Configuration`,
        description: validationMessages.join('\n\n'),
        variant: "destructive",
      });
    }
    
    // Save both model values to ensure they're both in the database
    saveSettings({
      use_openai_for_story_gen: checked,
      story_generation_model: currentStoryModel,
      openrouter_model: !checked ? currentStoryModel : openAIModel, // Save the OpenRouter model
    });
    
    setIsEditingStoryModel(true);
    setIsEditingReasoningModel(true);
    setModelValidation(storyValidation);
    setReasoningModelValidation(reasoningValidation);
    onUseOpenAIForStoryGenChange(checked);
  };

  // Check if the selected model is multilingual_v2
  const isMultilingualV2 = elevenLabsModel === "eleven_multilingual_v2";

  // Update parent component state when voice settings change
  const handleStabilityChange = (values: number[]) => {
    const value = values[0];
    setStability(value);
    onVoiceStabilityChange(value);
  };
  
  const handleSimilarityBoostChange = (values: number[]) => {
    const value = values[0];
    setSimilarityBoost(value);
    onVoiceSimilarityBoostChange(value);
  };
  
  const handleVoiceStyleChange = (values: number[]) => {
    const value = values[0];
    setVoiceStyleState(value);
    onVoiceStyleChange(value);
  };
  
  const handleSpeakerBoostChange = (checked: boolean) => {
    setSpeakerBoostState(checked);
    onVoiceSpeakerBoostChange(checked);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Key className="h-5 w-5" />
        <h2 className="text-xl font-medium">AI Settings</h2>
      </div>
      <Separator />

      {/* Story Generation Provider Toggle */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Story Generation Settings</h3>
        <div className="flex items-center space-x-2">
          <Switch
            id="story-gen-provider"
            checked={useOpenAIForStoryGen}
            onCheckedChange={handleProviderChange}
          />
          <Label htmlFor="story-gen-provider">
            Use OpenAI for Story Generation
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          When enabled, OpenAI will be used for story generation. When disabled, OpenRouter will be used instead.
          {(isEditingStoryModel && !modelValidation.isValid) || (isEditingReasoningModel && !reasoningModelValidation.isValid) ? (
            <span className="block mt-1 text-red-500">
              {!modelValidation.isValid && "Story Generation Model format is invalid for selected provider."}
              {!modelValidation.isValid && !reasoningModelValidation.isValid && " "}
              {!reasoningModelValidation.isValid && "Reasoning Model format is invalid."}
              {" "}Please update the model names.
            </span>
          ) : null}
        </p>

        <div className="space-y-2">
          <label className="text-sm font-medium">Story Generation Model</label>
          <div className="relative">
            <Input
              value={useOpenAIForStoryGen ? storyGenerationModel : openAIModel}
              onChange={(e) => {
                const newValue = e.target.value;
                if (useOpenAIForStoryGen) {
                  onStoryGenerationModelChange(newValue);
                } else {
                  onOpenAIModelChange(newValue);
                  onStoryGenerationModelChange(newValue);
                }
                setIsEditingStoryModel(true);
                setModelValidation(validateModel(newValue, useOpenAIForStoryGen));
              }}
              onBlur={() => {
                if (!isEditingStoryModel) return;
                const currentModel = useOpenAIForStoryGen ? storyGenerationModel : openAIModel;
                if (!currentModel) {
                  setIsEditingStoryModel(false);
                  setModelValidation({ isValid: true, message: "" });
                }
              }}
              placeholder={`Enter model name (e.g., ${useOpenAIForStoryGen ? "gpt-4o" : "openai/gpt-4o-mini"})`}
              className={cn(
                "pr-8",
                isEditingStoryModel && modelValidation.message && (
                  modelValidation.isValid ? "border-green-500" : "border-red-500"
                )
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {isEditingStoryModel && modelValidation.message && <ValidationIcon {...modelValidation} />}
            </div>
          </div>
          {isEditingStoryModel && modelValidation.message && (
            <p className={cn(
              "text-xs",
              modelValidation.isValid ? "text-green-500" : "text-red-500"
            )}>
              {modelValidation.message}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Model that will be used for generating stories using {useOpenAIForStoryGen ? "OpenAI" : "OpenRouter"}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Reasoning Model</label>
          <div className="relative">
            <Input
              value={reasoningModel}
              onChange={(e) => {
                const newValue = e.target.value;
                onReasoningModelChange(newValue);
                setIsEditingReasoningModel(true);
                setReasoningModelValidation(validateReasoningModel(newValue, useOpenAIForStoryGen));
              }}
              onBlur={() => {
                if (!isEditingReasoningModel) return;
                if (!reasoningModel) {
                  setIsEditingReasoningModel(false);
                  setReasoningModelValidation({ isValid: true, message: "" });
                }
              }}
              placeholder={useOpenAIForStoryGen ? 
                "Enter model name (e.g., o-llama-3, llama-3.1-sonar)" : 
                "Enter model name (e.g., openai/gpt-4, anthropic/claude-3)"}
              className={cn(
                "pr-8",
                isEditingReasoningModel && reasoningModelValidation.message && (
                  reasoningModelValidation.isValid ? "border-green-500" : "border-red-500"
                )
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {isEditingReasoningModel && reasoningModelValidation.message && <ValidationIcon {...reasoningModelValidation} />}
            </div>
          </div>
          {isEditingReasoningModel && reasoningModelValidation.message && (
            <p className={cn(
              "text-xs",
              reasoningModelValidation.isValid ? "text-green-500" : "text-red-500"
            )}>
              {reasoningModelValidation.message}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Model used for analyzing and improving story outlines
          </p>
        </div>

        {/* Chapter Range Inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="min-chapters">Minimum Chapters</Label>
            <Input
              id="min-chapters"
              type="number"
              min={3}
              max={15}
              value={minChapters}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  setMinChapters(val);
                  onMinChaptersChange(val);
                }
              }}
              className={cn(chapterRangeError && "border-red-500")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-chapters">Maximum Chapters</Label>
            <Input
              id="max-chapters"
              type="number"
              min={3}
              max={15}
              value={maxChapters}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  setMaxChapters(val);
                  onMaxChaptersChange(val);
                }
              }}
              className={cn(chapterRangeError && "border-red-500")}
            />
          </div>
        </div>
        {chapterRangeError && (
          <p className="text-xs text-red-500 mt-1">{chapterRangeError}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Set the desired minimum and maximum number of chapters for generated story outlines (range 3-15).
        </p>
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
              value={openai_key}
              onChange={(e) => handleKeyChange(e.target.value, 'openai')}
              placeholder="Enter your OpenAI API key"
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
          <label className="text-sm font-medium">Story Ideas Model</label>
          <Input
            value={titleFineTuneModel}
            onChange={(e) => onTitleFineTuneModelChange(e.target.value)}
            placeholder="Enter model name (e.g., gpt-4)"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Title Generation Model</label>
          <Input
            value={rewritingModel}
            onChange={(e) => onRewritingModelChange(e.target.value)}
            placeholder="Enter model name (e.g., gpt-4)"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Story Rewrite Model</label>
          <Input
            value={rewriteModel}
            onChange={(e) => onRewriteModelChange(e.target.value)}
            placeholder="Enter model name (e.g., gpt-4)"
          />
        </div>
      </div>

      <Separator />

      {/* OpenRouter Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">OpenRouter Settings</h3>
        <div className="space-y-2">
          <label className="text-sm font-medium">OpenRouter API Key</label>
          <div className="relative">
            <Input
              type="password"
              value={openAIKey}
              onChange={(e) => handleKeyChange(e.target.value, 'openrouter')}
              placeholder="Enter your OpenRouter API key"
              className={cn(
                "pr-8",
                editingKeys.openrouter && keyValidation.openrouter.message && (
                  keyValidation.openrouter.isValid ? "border-green-500" : "border-red-500"
                )
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {editingKeys.openrouter && <ValidationIcon {...keyValidation.openrouter} />}
            </div>
          </div>
          {editingKeys.openrouter && keyValidation.openrouter.message && (
            <p className={cn(
              "text-xs",
              keyValidation.openrouter.isValid ? "text-green-500" : "text-red-500"
            )}>
              {keyValidation.openrouter.message}
            </p>
          )}
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
            onValueChange={(value) => {
              onElevenLabsModelChange(value);
              // Reset style when changing models
              if (value !== "eleven_multilingual_v2") {
                setVoiceStyleState(0.5);
                setSpeakerBoostState(false);
              }
            }}
            disabled={loadingModels || !elevenLabsKey || !keyValidation.elevenlabs.isValid}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a voice model" />
            </SelectTrigger>
            <SelectContent>
              {voiceModels.map((model) => (
                <SelectItem key={model.model_id} value={model.model_id}>
                  {model.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!elevenLabsKey && (
            <p className="text-xs text-muted-foreground mt-1">
              Enter your API key to see available models
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Voice</label>
          <Select 
            value={elevenLabsVoiceId}
            onValueChange={onElevenLabsVoiceIdChange}
            disabled={loadingVoices || !elevenLabsKey || !keyValidation.elevenlabs.isValid}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.voice_id} value={voice.voice_id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!elevenLabsKey && (
            <p className="text-xs text-muted-foreground mt-1">
              Enter your API key to see available voices
            </p>
          )}
          {voices.length === 0 && elevenLabsKey && keyValidation.elevenlabs.isValid && !loadingVoices && (
            <p className="text-xs text-muted-foreground mt-1">
              No voices found in your account
            </p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Voice Stability: </label>
          <div className="flex items-center gap-2">
            <Slider
              className="flex-1"
              min={0}
              max={1}
              step={0.01}
              value={[stability]}
              onValueChange={handleStabilityChange}
              disabled={!elevenLabsKey || !keyValidation.elevenlabs.isValid}
            />
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={stability}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value >= 0 && value <= 1) {
                  setStability(value);
                  onVoiceStabilityChange(value);
                }
              }}
              className="w-20"
              disabled={!elevenLabsKey || !keyValidation.elevenlabs.isValid}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Higher values make the voice more consistent but may sound less natural
          </p>
        </div>
        
        <div>
          <label className="text-sm font-medium">Similarity Boost: </label>
          <div className="flex items-center gap-2">
            <Slider
              className="flex-1"
              min={0}
              max={1}
              step={0.01}
              value={[similarityBoost]}
              onValueChange={handleSimilarityBoostChange}
              disabled={!elevenLabsKey || !keyValidation.elevenlabs.isValid}
            />
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={similarityBoost}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value >= 0 && value <= 1) {
                  setSimilarityBoost(value);
                  onVoiceSimilarityBoostChange(value);
                }
              }}
              className="w-20"
              disabled={!elevenLabsKey || !keyValidation.elevenlabs.isValid}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Higher values make the voice more similar to the original but may reduce quality
          </p>
        </div>

        {/* Voice Style - only for multilingual_v2 model */}
        {isMultilingualV2 && (
          <div>
            <label className="text-sm font-medium">Voice Style: </label>
            <div className="flex items-center gap-2">
              <Slider
                className="flex-1"
                min={0}
                max={1}
                step={0.01}
                value={[voiceStyleState]}
                onValueChange={handleVoiceStyleChange}
                disabled={!elevenLabsKey || !keyValidation.elevenlabs.isValid}
              />
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={voiceStyleState}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value >= 0 && value <= 1) {
                    setVoiceStyleState(value);
                    onVoiceStyleChange(value);
                  }
                }}
                className="w-20"
                disabled={!elevenLabsKey || !keyValidation.elevenlabs.isValid}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Controls the style of the voice. Higher values make the voice more expressive
            </p>
          </div>
        )}

        {/* Speaker Boost Toggle - only for multilingual_v2 model */}
        {isMultilingualV2 && (
          <div className="flex items-center space-x-2 mt-4">
            <Switch
              id="speaker-boost"
              checked={speakerBoostState}
              onCheckedChange={handleSpeakerBoostChange}
              disabled={!elevenLabsKey || !keyValidation.elevenlabs.isValid}
            />
            <Label htmlFor="speaker-boost">Speaker Boost</Label>
            <div className="ml-2 text-xs text-muted-foreground">
              {speakerBoostState ? "On" : "Off"}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Image Generation Settings */}
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

        <Separator className="my-4" />
        
        <FontManagement userId={userId} />
      </div>

      <div className="mt-8">
        <Button 
          onClick={handleSaveAISettings} 
          disabled={isSaving || (!keyValidation.openai.isValid && !keyValidation.openrouter.isValid && !keyValidation.elevenlabs.isValid && !keyValidation.replicate.isValid)}
          className="w-full"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { AISettings } from "@/components/settings/AISettings";
import type { UserSettings } from "@/types/settings";
import { userSettingsService } from "@/services/UserSettingsService";
import { setDocumentTitle } from "@/utils/document";
import { motion } from "framer-motion";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [openAIModel, setOpenAIModel] = useState("");
  const [reasoningModel, setReasoningModel] = useState("");
  const [openAIKey, setOpenAIKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [titleFineTuneModel, setTitleFineTuneModel] = useState("");
  const [rewritingModel, setRewritingModel] = useState("");
  const [rewriteModel, setRewriteModel] = useState("");
  const [storyGenerationModel, setStoryGenerationModel] = useState("");
  const [useOpenAIForStoryGen, setUseOpenAIForStoryGen] = useState(false);
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [elevenLabsModel, setElevenLabsModel] = useState("");
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState("");
  const [replicateKey, setReplicateKey] = useState("");
  const [voiceStability, setVoiceStability] = useState(0.75);
  const [voiceSimilarityBoost, setVoiceSimilarityBoost] = useState(0.75);
  const [voiceStyle, setVoiceStyle] = useState(0.5);
  const [voiceSpeakerBoost, setVoiceSpeakerBoost] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Add state for chapter range
  const [minChapters, setMinChapters] = useState<number>(5); 
  const [maxChapters, setMaxChapters] = useState<number>(7);

  useEffect(() => {
    setDocumentTitle("Settings");
    
    if (!user) {
      navigate("/auth");
      return;
    }

    async function loadSettings() {
      try {
        const settings = await userSettingsService.getSettings(user.id);
        console.log('Loaded settings:', settings);
        
        // Default models for each provider
        const defaultOpenAIStoryModel = "gpt-4o";
        const defaultOpenRouterStoryModel = "openai/gpt-4o-mini";
        
        // Set OpenRouter model (used when OpenAI is disabled)
        setOpenAIModel(settings.openrouter_model || defaultOpenRouterStoryModel);
        
        setOpenAIKey(settings.openrouter_key || "");
        setOpenaiKey(settings.openai_key || "");
        setReasoningModel(settings.reasoning_model || "anthropic/claude-3-haiku-20240307");
        setTitleFineTuneModel(settings.title_fine_tune_model || "gpt-4o");
        setRewritingModel(settings.rewriting_model || "gpt-4o");
        setRewriteModel(settings.rewrite_model || "gpt-4o");
        
        // Set OpenAI story generation model (used when OpenAI is enabled)
        // If it's missing or invalid for OpenAI, set a default
        const useOpenAI = settings.use_openai_for_story_gen || false;
        setUseOpenAIForStoryGen(useOpenAI);
        
        // Ensure we have a valid model for the current provider
        let storyModel = settings.story_generation_model || "";
        
        if (useOpenAI) {
          // If using OpenAI but the model doesn't start with gpt-, use default
          if (!storyModel || !storyModel.startsWith('gpt-')) {
            storyModel = defaultOpenAIStoryModel;
          }
        } else {
          // If using OpenRouter but the model doesn't have a provider prefix, use default
          if (!storyModel || !storyModel.includes('/')) {
            storyModel = settings.openrouter_model || defaultOpenRouterStoryModel;
          }
        }
        
        setStoryGenerationModel(storyModel);
        console.log('Set story generation model to:', storyModel);
        
        setElevenLabsKey(settings.elevenlabs_key || "");
        setElevenLabsModel(settings.elevenlabs_model || "eleven_multilingual_v2");
        setElevenLabsVoiceId(settings.elevenlabs_voice_id || "");
        setReplicateKey(settings.replicate_key || "");
        
        // Load voice settings
        setVoiceStability(settings.voice_stability ?? 0.75);
        setVoiceSimilarityBoost(settings.voice_similarity_boost ?? 0.75);
        setVoiceStyle(settings.voice_style ?? 0.5);
        setVoiceSpeakerBoost(settings.voice_speaker_boost ?? false);

        // Load chapter range settings
        setMinChapters(settings.min_chapters ?? 5); 
        setMaxChapters(settings.max_chapters ?? 7);

      } catch (error: any) {
        console.error("Error loading settings:", error);
        toast({
          title: "Error",
          description: "Failed to load settings",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [user, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  if (!user) return null;

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-50 w-full">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleGoBack}
              className="mr-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <SettingsIcon className="h-6 w-6" />
              Settings
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-muted rounded-lg p-6 shadow-sm"
          >
            <ProfileSettings userId={user.id} />
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-muted rounded-lg p-6 shadow-sm"
          >
            <AISettings
              userId={user.id}
              openAIKey={openAIKey}
              openai_key={openaiKey}
              openAIModel={openAIModel}
              reasoningModel={reasoningModel}
              titleFineTuneModel={titleFineTuneModel}
              rewritingModel={rewritingModel}
              rewriteModel={rewriteModel}
              storyGenerationModel={storyGenerationModel}
              useOpenAIForStoryGen={useOpenAIForStoryGen}
              elevenLabsKey={elevenLabsKey}
              elevenLabsModel={elevenLabsModel}
              elevenLabsVoiceId={elevenLabsVoiceId}
              replicateKey={replicateKey}
              voiceStability={voiceStability}
              voiceSimilarityBoost={voiceSimilarityBoost}
              voiceStyle={voiceStyle}
              voiceSpeakerBoost={voiceSpeakerBoost}
              minChapters={minChapters}
              maxChapters={maxChapters}
              onOpenAIKeyChange={setOpenAIKey}
              onOpenaiKeyChange={setOpenaiKey}
              onOpenAIModelChange={setOpenAIModel}
              onReasoningModelChange={setReasoningModel}
              onTitleFineTuneModelChange={setTitleFineTuneModel}
              onRewritingModelChange={setRewritingModel}
              onRewriteModelChange={setRewriteModel}
              onStoryGenerationModelChange={setStoryGenerationModel}
              onUseOpenAIForStoryGenChange={setUseOpenAIForStoryGen}
              onElevenLabsKeyChange={setElevenLabsKey}
              onElevenLabsModelChange={setElevenLabsModel}
              onElevenLabsVoiceIdChange={setElevenLabsVoiceId}
              onReplicateKeyChange={setReplicateKey}
              onVoiceStabilityChange={setVoiceStability}
              onVoiceSimilarityBoostChange={setVoiceSimilarityBoost}
              onVoiceStyleChange={setVoiceStyle}
              onVoiceSpeakerBoostChange={setVoiceSpeakerBoost}
              onMinChaptersChange={setMinChapters}
              onMaxChaptersChange={setMaxChapters}
            />
          </motion.div>
        </div>
      </main>
    </div>
  );
}

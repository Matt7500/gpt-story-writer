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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDocumentTitle("Settings");
    
    if (!user) {
      navigate("/auth");
      return;
    }

    async function loadSettings() {
      try {
        const settings = await userSettingsService.getSettings(user.id);
        
        setOpenAIModel(settings.openrouter_model || "gpt-4o-mini");
        setOpenAIKey(settings.openrouter_key || "");
        setOpenaiKey(settings.openai_key || "");
        setReasoningModel(settings.reasoning_model || "llama-3.1-sonar-small-128k-online");
        setTitleFineTuneModel(settings.title_fine_tune_model || "gpt-4");
        setRewritingModel(settings.rewriting_model || "gpt-4");
        setRewriteModel(settings.rewrite_model || "gpt-4");
        setStoryGenerationModel(settings.story_generation_model || "gpt-4");
        setUseOpenAIForStoryGen(settings.use_openai_for_story_gen || false);
        setElevenLabsKey(settings.elevenlabs_key || "");
        setElevenLabsModel(settings.elevenlabs_model || "eleven_multilingual_v2");
        setElevenLabsVoiceId(settings.elevenlabs_voice_id || "");
        setReplicateKey(settings.replicate_key || "");
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
            />
          </motion.div>
        </div>
      </main>
    </div>
  );
}

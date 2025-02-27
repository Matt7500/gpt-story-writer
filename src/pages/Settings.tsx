import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { AISettings } from "@/components/settings/AISettings";
import type { UserSettings } from "@/types/settings";
import { userSettingsService } from "@/services/UserSettingsService";

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
    return <div className="p-8">Loading...</div>;
  }

  if (!user) return null;

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="container max-w-2xl mx-auto py-8">
      <div className="flex items-center gap-2 mb-8">
        <SettingsIcon className="h-5 w-5" />
        <h1 className="text-2xl font-medium">Settings</h1>
      </div>

      <div className="space-y-8">
        <ProfileSettings userId={user.id} />
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
      </div>

      <div className="mt-8">
        <Button variant="outline" onClick={handleGoBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { AISettings } from "@/components/settings/AISettings";
import type { UserSettings } from "@/types/settings";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [openAIModel, setOpenAIModel] = useState("");
  const [reasoningModel, setReasoningModel] = useState("");
  const [openAIKey, setOpenAIKey] = useState("");
  const [titleFineTuneModel, setTitleFineTuneModel] = useState("");
  const [rewritingModel, setRewritingModel] = useState("");
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
        // Load AI settings
        const { data: settingsData, error: settingsError } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .single();

        console.log("Settings data from DB:", settingsData);

        if (settingsError) {
          console.log("Settings error:", settingsError);
          if (settingsError.code !== "PGRST116") {
            throw settingsError;
          }
        }

        if (settingsData) {
          const settings = settingsData as UserSettings;
          console.log("Setting openai_model to:", settings.openrouter_model || "gpt-4o-mini");
          setOpenAIModel(settings.openrouter_model || "gpt-4o-mini");
          setOpenAIKey(settings.openrouter_key || "");
          setReasoningModel(settings.reasoning_model || "llama-3.1-sonar-small-128k-online");
          setTitleFineTuneModel(settings.title_fine_tune_model || "");
          setRewritingModel(settings.rewriting_model || "");
          setElevenLabsKey(settings.elevenlabs_key || "");
          setElevenLabsModel(settings.elevenlabs_model || "eleven_multilingual_v2");
          setElevenLabsVoiceId(settings.elevenlabs_voice_id || "");
          setReplicateKey(settings.replicate_key || "");
        } else {
          console.log("No settings found, creating default settings");
          const defaultSettings = {
            user_id: user.id,
            openrouter_model: "gpt-4o-mini",
            reasoning_model: "llama-3.1-sonar-small-128k-online",
            elevenlabs_model: "eleven_multilingual_v2"
          };

          const { data: newSettings, error: insertError } = await supabase
            .from("user_settings")
            .insert([defaultSettings])
            .select()
            .single();
          
          if (insertError) throw insertError;

          console.log("New settings created:", newSettings);
          
          // Set state with the newly created settings
          if (newSettings) {
            setOpenAIModel(newSettings.openrouter_model || "gpt-4o-mini");
            setReasoningModel(newSettings.reasoning_model || "llama-3.1-sonar-small-128k-online");
            setElevenLabsModel(newSettings.elevenlabs_model || "eleven_multilingual_v2");
          }
        }
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
    <div className="container max-w-2xl mx-auto p-8 space-y-8">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <ProfileSettings userId={user.id} />

      <AISettings
        userId={user.id}
        openAIKey={openAIKey}
        openAIModel={openAIModel}
        reasoningModel={reasoningModel}
        titleFineTuneModel={titleFineTuneModel}
        rewritingModel={rewritingModel}
        elevenLabsKey={elevenLabsKey}
        elevenLabsModel={elevenLabsModel}
        elevenLabsVoiceId={elevenLabsVoiceId}
        replicateKey={replicateKey}
        onOpenAIKeyChange={setOpenAIKey}
        onOpenAIModelChange={setOpenAIModel}
        onReasoningModelChange={setReasoningModel}
        onTitleFineTuneModelChange={setTitleFineTuneModel}
        onRewritingModelChange={setRewritingModel}
        onElevenLabsKeyChange={setElevenLabsKey}
        onElevenLabsModelChange={setElevenLabsModel}
        onElevenLabsVoiceIdChange={setElevenLabsVoiceId}
        onReplicateKeyChange={setReplicateKey}
      />

      <Button
        variant="outline"
        onClick={handleGoBack}
        className="mt-8"
      >
        Back
      </Button>
    </div>
  );
}

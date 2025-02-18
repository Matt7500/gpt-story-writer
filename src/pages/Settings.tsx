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
  const [openAIModel, setOpenAIModel] = useState("gpt-4o-mini");
  const [reasoningModel, setReasoningModel] = useState("llama-3.1-sonar-small-128k-online");
  const [openAIKey, setOpenAIKey] = useState("");
  const [titleFineTuneModel, setTitleFineTuneModel] = useState("");
  const [rewritingModel, setRewritingModel] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [elevenLabsModel, setElevenLabsModel] = useState("eleven_multilingual_v2");
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

        if (settingsError && settingsError.code !== "PGRST116") {
          throw settingsError;
        }

        if (settingsData) {
          const settings = settingsData as UserSettings;
          setOpenAIModel(settings.openai_model || "gpt-4o-mini");
          setOpenAIKey(settings.openai_key || "");
          setReasoningModel(settings.reasoning_model || "llama-3.1-sonar-small-128k-online");
          setTitleFineTuneModel(settings.title_fine_tune_model || "");
          setRewritingModel(settings.rewriting_model || "");
          setElevenLabsKey(settings.elevenlabs_key || "");
          setElevenLabsModel(settings.elevenlabs_model || "eleven_multilingual_v2");
          setElevenLabsVoiceId(settings.elevenlabs_voice_id || "");
          setReplicateKey(settings.replicate_key || "");
        } else {
          // Create default settings if none exist
          const { error: insertError } = await supabase
            .from("user_settings")
            .insert([{ 
              user_id: user.id,
              openai_model: "gpt-4o-mini",
              reasoning_model: "llama-3.1-sonar-small-128k-online",
              elevenlabs_model: "eleven_multilingual_v2"
            }]);
          
          if (insertError) throw insertError;
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


import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings as SettingsIcon, User, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface UserSettings {
  created_at: string;
  updated_at: string;
  user_id: string;
  openai_key: string | null;
  openai_model: string | null;
  reasoning_model: string | null;
  title_fine_tune_model: string | null;
  rewriting_model: string | null;
}

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [openAIModel, setOpenAIModel] = useState("gpt-4o-mini");
  const [reasoningModel, setReasoningModel] = useState("llama-3.1-sonar-small-128k-online");
  const [openAIKey, setOpenAIKey] = useState("");
  const [titleFineTuneModel, setTitleFineTuneModel] = useState("");
  const [rewritingModel, setRewritingModel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    async function loadSettings() {
      try {
        // Load profile data
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;
        if (profileData) {
          setUsername(profileData.username || "");
        }

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
        } else {
          // Create default settings if none exist
          const { error: insertError } = await supabase
            .from("user_settings")
            .insert([{ 
              user_id: user.id, 
              openai_model: "gpt-4o-mini",
              reasoning_model: "llama-3.1-sonar-small-128k-online"
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

  const handleSaveProfile = async () => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username })
        .eq("id", user?.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    }
  };

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
        .eq("user_id", user?.id);

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

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="container max-w-2xl mx-auto p-8 space-y-8">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      {/* Profile Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5" />
          <h2 className="text-xl font-medium">Profile Settings</h2>
        </div>
        <Separator />
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <Button onClick={handleSaveProfile}>Save Profile</Button>
        </div>
      </div>

      {/* AI Settings */}
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
              onChange={(e) => setOpenAIKey(e.target.value)}
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
              onChange={(e) => setOpenAIModel(e.target.value)}
              placeholder="Enter model name (e.g., gpt-4o-mini)"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reasoning Model</label>
            <Input
              value={reasoningModel}
              onChange={(e) => setReasoningModel(e.target.value)}
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
              onChange={(e) => setTitleFineTuneModel(e.target.value)}
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
              onChange={(e) => setRewritingModel(e.target.value)}
              placeholder="Enter fine-tuned model for rewriting"
            />
            <p className="text-sm text-muted-foreground">
              Custom model for rewriting and refining story content.
            </p>
          </div>

          <Button onClick={handleSaveAISettings}>Save AI Settings</Button>
        </div>
      </div>

      <Button
        variant="outline"
        onClick={() => navigate("/")}
        className="mt-8"
      >
        Back to Stories
      </Button>
    </div>
  );
}

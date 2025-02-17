import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings as SettingsIcon, User, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [openAIModel, setOpenAIModel] = useState("gpt-4o-mini");
  const [reasoningModel, setReasoningModel] = useState("llama-3.1-sonar-small-128k-online");
  const [openAIKey, setOpenAIKey] = useState("");
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
          setOpenAIModel(settingsData.openai_model || "gpt-4o-mini");
          setOpenAIKey(settingsData.openai_key || "");
          setReasoningModel(settingsData.reasoning_model || "llama-3.1-sonar-small-128k-online");
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
          reasoning_model: reasoningModel
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
            <Select value={openAIModel} onValueChange={setOpenAIModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o-mini">GPT-4O Mini (Faster)</SelectItem>
                <SelectItem value="gpt-4o">GPT-4O (More Powerful)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reasoning Model</label>
            <Select value={reasoningModel} onValueChange={setReasoningModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="llama-3.1-sonar-small-128k-online">Llama 3.1 Sonar Small (Fast)</SelectItem>
                <SelectItem value="llama-3.1-sonar-large-128k-online">Llama 3.1 Sonar Large (Balanced)</SelectItem>
                <SelectItem value="llama-3.1-sonar-huge-128k-online">Llama 3.1 Sonar Huge (Powerful)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Used for analyzing and reasoning about your stories.
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

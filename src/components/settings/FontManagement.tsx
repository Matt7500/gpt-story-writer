import { useState, useEffect } from "react";
import { Trash2, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Font {
  id: string;
  font_name: string;
  font_family: string;
  font_weight: string;
  created_at: string;
}

interface FontManagementProps {
  userId: string;
}

export function FontManagement({ userId }: FontManagementProps) {
  const [fonts, setFonts] = useState<Font[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fontName, setFontName] = useState("");
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchFonts();
  }, []);

  const fetchFonts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('http://localhost:3001/api/fonts', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch fonts');

      const data = await response.json();
      setFonts(data.fonts);
    } catch (error) {
      console.error('Error fetching fonts:', error);
      toast({
        title: "Error",
        description: "Failed to load fonts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "Error",
          description: "Font file size must be less than 5MB",
          variant: "destructive",
        });
        return;
      }
      
      if (!file.name.endsWith('.ttf') && !file.name.endsWith('.otf')) {
        toast({
          title: "Error",
          description: "Only .ttf and .otf files are allowed",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setFontName(file.name.replace(/\.[^/.]+$/, "")); // Remove extension
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      // Generate a unique filename
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;

      // Determine content type based on file extension
      let contentType;
      switch (fileExt) {
        case 'ttf':
          contentType = 'font/ttf';
          break;
        case 'otf':
          contentType = 'font/otf';
          break;
        default:
          throw new Error('Unsupported font file type. Please use .ttf or .otf files.');
      }

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('user_fonts')
        .upload(filePath, selectedFile, {
          contentType,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get the URL for the uploaded font
      const { data: { publicUrl } } = supabase.storage
        .from('user_fonts')
        .getPublicUrl(filePath);

      // Insert font record into the database
      const { error: dbError } = await supabase
        .from('user_fonts')
        .insert({
          user_id: session.user.id,
          font_name: fontName,
          font_file_path: filePath,
          font_family: selectedFile.name.replace(/\.[^/.]+$/, ""),
          font_weight: 'normal'
        });

      if (dbError) {
        // If database insert fails, clean up the uploaded file
        await supabase.storage
          .from('user_fonts')
          .remove([filePath]);
        throw dbError;
      }

      await fetchFonts();
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setFontName("");

      toast({
        title: "Success",
        description: "Font uploaded successfully",
      });
    } catch (error: any) {
      console.error('Error uploading font:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload font",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fontId: string) => {
    try {
      const { data: font, error: fetchError } = await supabase
        .from('user_fonts')
        .select('font_file_path')
        .eq('id', fontId)
        .single();

      if (fetchError) throw fetchError;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('user_fonts')
        .remove([font.font_file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('user_fonts')
        .delete()
        .eq('id', fontId);

      if (dbError) throw dbError;

      setFonts(fonts.filter(f => f.id !== fontId));
      toast({
        title: "Success",
        description: "Font deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting font:', error);
      toast({
        title: "Error",
        description: "Failed to delete font",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Custom Fonts</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUploadDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Font
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading fonts...</p>
      ) : fonts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No custom fonts added</p>
      ) : (
        <div className="space-y-2">
          {fonts.map((font) => (
            <div
              key={font.id}
              className="flex items-center justify-between p-2 rounded-md border"
            >
              <div>
                <p className="font-medium">{font.font_name}</p>
                <p className="text-sm text-muted-foreground">
                  {font.font_family} ({font.font_weight})
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(font.id)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Font</DialogTitle>
            <DialogDescription>
              Upload a custom font file (.ttf or .otf) to use in your documents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <label htmlFor="fontFile" className="text-sm font-medium">
                Font File
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="fontFile"
                  type="file"
                  accept=".ttf,.otf"
                  onChange={handleFileSelect}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Maximum file size: 5MB
              </p>
            </div>

            {selectedFile && (
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <label htmlFor="fontName" className="text-sm font-medium">
                  Font Name
                </label>
                <Input
                  id="fontName"
                  value={fontName}
                  onChange={(e) => setFontName(e.target.value)}
                  placeholder="Enter a name for this font"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !fontName || uploading}
            >
              {uploading ? (
                <>Uploading...</>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Font
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 
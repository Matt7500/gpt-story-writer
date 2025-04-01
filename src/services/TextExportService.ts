import { supabase } from "@/integrations/supabase/client";

interface ExportProgress {
  progress: number;
  currentChapter: string;
}

interface Chapter {
  title: string;
  content: string;
  completed: boolean;
  sceneBeat: string;
}

export class TextExportService {
  private static instance: TextExportService;
  private eventSource: EventSource | null = null;

  private constructor() {}

  public static getInstance(): TextExportService {
    if (!TextExportService.instance) {
      TextExportService.instance = new TextExportService();
    }
    return TextExportService.instance;
  }

  private async getAuthToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }
    return session.access_token;
  }

  public async exportAsText(
    chapters: Chapter[], 
    title: string, 
    onProgress?: (progress: ExportProgress) => void,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      const token = await this.getAuthToken();

      // Start the export process
      const response = await fetch('http://localhost:3001/api/export/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ chapters, title }),
        signal
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Export failed');
      }

      const { sessionId, content } = await response.json();

      // Set up SSE for progress updates
      if (onProgress) {
        this.eventSource = new EventSource(
          `http://localhost:3001/api/export/text/progress/${sessionId}`,
          { withCredentials: true }
        );

        this.eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type !== 'connected') {
            onProgress({
              progress: data.progress,
              currentChapter: data.currentChapter || 'Processing...'
            });
          }
        };

        this.eventSource.onerror = () => {
          this.eventSource?.close();
          this.eventSource = null;
        };

        // Handle abort signal
        if (signal) {
          signal.addEventListener('abort', () => {
            this.eventSource?.close();
            this.eventSource = null;
          });
        }
      }

      return content;
    } catch (error: any) {
      console.error("Text export process ended:", {
        type: error.name === 'AbortError' ? 'Cancellation' : 'Error',
        message: error.message,
        details: error.stack
      });
      throw error;
    } finally {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    }
  }

  public downloadTextFile(content: string, title: string): void {
    const blob = new Blob([content], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${sanitizedTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

export const textExportService = TextExportService.getInstance(); 
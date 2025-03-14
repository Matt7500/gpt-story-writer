import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "./components/ThemeToggle";
import { AuthProvider } from "./components/AuthProvider";
import Editor from "./pages/Editor";
import Auth from "./pages/Auth";
import Stories from "./pages/Stories";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ImageEditor from "./pages/ImageEditor";
import { useAuth } from "./components/AuthProvider";

const queryClient = new QueryClient();

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/auth" />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route
        path="/editor/:id"
        element={
          <PrivateRoute>
            <Editor />
          </PrivateRoute>
        }
      />
      <Route
        path="/image-editor"
        element={
          <PrivateRoute>
            <ImageEditor />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Settings />
          </PrivateRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Stories />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <ThemeToggle />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

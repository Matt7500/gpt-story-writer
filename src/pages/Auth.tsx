import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { setDocumentTitle } from "@/utils/document";
import { createUser, signInUser } from "@/lib/auth";

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setDocumentTitle(isSignUp ? "Sign Up" : "Sign In");
  }, [isSignUp]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        // Use the helper function for signup
        const { data, error } = await createUser(email, password);
        
        if (error) {
          throw error;
        }
        
        toast({
          title: "Account created",
          description: "Please check your email to confirm your account.",
        });
      } else {
        // Use the helper function for signin
        const { data, error } = await signInUser(email, password);
        
        if (error) {
          throw error;
        }
        
        navigate("/");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold tracking-tight">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignUp
              ? "Sign up to start writing your stories"
              : "Sign in to continue writing"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              Email address
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Loading..."
              : isSignUp
              ? "Create account"
              : "Sign in"}
          </Button>
          <p className="text-center text-sm">
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary hover:underline"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function VerifyEmailPage() {
  const [location, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get token from URL
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        if (!token) {
          setStatus("error");
          setErrorMessage("Missing verification token");
          return;
        }

        // Call the API to verify the email
        const response = await fetch(`/api/verify-email?token=${token}`);
        
        if (response.ok) {
          setStatus("success");
          // Redirect to login page after a brief delay
          setTimeout(() => {
            navigate("/auth?verified=true");
          }, 3000);
        } else {
          const data = await response.json();
          setStatus("error");
          setErrorMessage(data.message || "Email verification failed");
        }
      } catch (error: any) {
        setStatus("error");
        setErrorMessage(error.message || "An unexpected error occurred");
      }
    };

    verifyEmail();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Email Verification</CardTitle>
          <CardDescription className="text-center">
            {status === "loading" && "Verifying your email..."}
            {status === "success" && "Your email has been verified!"}
            {status === "error" && "Verification failed"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
              <p className="text-gray-600">Please wait while we verify your email address</p>
            </div>
          )}
          
          {status === "success" && (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-gray-600 text-center">
                Your email has been successfully verified!
                <br />
                You will be redirected to the login page shortly.
              </p>
              <Button
                onClick={() => navigate("/auth?verified=true")}
                className="mt-4 bg-amber-500 text-black font-semibold hover:bg-amber-600"
              >
                Go to Login
              </Button>
            </div>
          )}
          
          {status === "error" && (
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <p className="text-red-600 text-center">{errorMessage || "An error occurred during verification"}</p>
              <Button
                onClick={() => navigate("/auth")}
                className="mt-4 bg-amber-500 text-black font-semibold hover:bg-amber-600"
              >
                Return to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
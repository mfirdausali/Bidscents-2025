import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ArrowRight, ArrowLeft, Loader } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Extended schemas with validation
const loginSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

const registerSchema = insertUserSchema.extend({
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string(),
  email: z.string().email({ message: "Please enter a valid email address" }),
  terms: z.boolean().refine(val => val === true, {
    message: "You must accept the terms and conditions"
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// Forgot password schema
const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
});

// Verify code schema
const verifyCodeSchema = z.object({
  code: z.string().length(6, { message: "Please enter a valid 6-digit code" }),
});

// Reset password schema
const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, { message: "Password must be at least 8 characters" }),
  confirmNewPassword: z.string().min(8, { message: "Password must be at least 8 characters" }),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords do not match",
  path: ["confirmNewPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
type VerifyCodeFormValues = z.infer<typeof verifyCodeSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function AuthPage() {
  const [location, navigate] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStep, setResetStep] = useState<"email" | "code" | "password">("email");
  
  // Get tab from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1]);
    const tab = params.get("tab");
    if (tab === "register") {
      setActiveTab("register");
    } else if (tab === "forgot") {
      setActiveTab("forgot");
    }
  }, [location]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  // Login form
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Register form
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      email: "",
      firstName: "",
      lastName: "",
      isSeller: false,
      isAdmin: false,
      terms: false,
    },
  });
  
  // Forgot password form
  const forgotPasswordForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });
  
  // Verify code form
  const verifyCodeForm = useForm<VerifyCodeFormValues>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: {
      code: "",
    },
  });
  
  // Reset password form
  const resetPasswordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmNewPassword: "",
    },
  });
  
  // Forgot password mutation
  const forgotPasswordMutation = useMutation({
    mutationKey: ["forgotPassword"],
    mutationFn: async (data: { email: string }) => {
      return apiRequest<{ success: boolean }>({
        url: "/api/forgot-password",
        method: "POST",
        data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Verification code sent",
        description: "Please check your email for the 6-digit code",
      });
      setResetEmail(forgotPasswordForm.getValues().email);
      setResetStep("code");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code",
        variant: "destructive",
      });
    },
  });
  
  // Verify code mutation
  const verifyCodeMutation = useMutation({
    mutationKey: ["verifyResetCode"],
    mutationFn: async (data: { email: string; code: string }) => {
      return apiRequest<{ success: boolean }>({
        url: "/api/verify-reset-code",
        method: "POST",
        data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Code verified",
        description: "Please create a new password",
      });
      setResetStep("password");
    },
    onError: (error) => {
      toast({
        title: "Invalid code",
        description: error.message || "The code is invalid or has expired",
        variant: "destructive",
      });
    },
  });
  
  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationKey: ["resetPassword"],
    mutationFn: async (data: { email: string; code: string; newPassword: string }) => {
      return apiRequest<{ success: boolean }>({
        url: "/api/reset-password",
        method: "POST",
        data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Password reset successful",
        description: "You can now login with your new password",
      });
      setActiveTab("login");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const onLoginSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(data);
  };

  const onRegisterSubmit = (data: RegisterFormValues) => {
    // Remove confirmPassword and terms from data before sending to API
    const { confirmPassword, terms, ...registerData } = data;
    registerMutation.mutate(registerData);
  };
  
  const onForgotPasswordSubmit = (data: ForgotPasswordFormValues) => {
    forgotPasswordMutation.mutate(data);
  };
  
  const onVerifyCodeSubmit = (data: VerifyCodeFormValues) => {
    verifyCodeMutation.mutate({
      email: resetEmail,
      code: data.code,
    });
  };
  
  const onResetPasswordSubmit = (data: ResetPasswordFormValues) => {
    resetPasswordMutation.mutate({
      email: resetEmail,
      code: verifyCodeForm.getValues().code,
      newPassword: data.newPassword,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Left side - Auth forms */}
      <div className="w-full md:w-1/2 p-8 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="text-3xl font-playfair font-bold text-rich-black">
              <span className="text-gold">E</span>ssence
            </Link>
            <p className="text-gray-600 mt-2">Your Premium Perfume Marketplace</p>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
              <TabsTrigger value="forgot">Forgot Password</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>
                    Sign in to your account to continue
                  </CardDescription>
                </CardHeader>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-username">Username</Label>
                      <Input
                        id="login-username"
                        {...loginForm.register("username")}
                        placeholder="Enter your username"
                      />
                      {loginForm.formState.errors.username && (
                        <p className="text-sm text-red-500">
                          {loginForm.formState.errors.username.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label htmlFor="login-password">Password</Label>
                        <button 
                          type="button" 
                          onClick={() => setActiveTab("forgot")}
                          className="text-sm text-gold hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <Input
                        id="login-password"
                        type="password"
                        {...loginForm.register("password")}
                        placeholder="Enter your password"
                      />
                      {loginForm.formState.errors.password && (
                        <p className="text-sm text-red-500">
                          {loginForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      type="submit" 
                      className="w-full bg-amber-500 text-black font-semibold hover:bg-amber-600"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <span className="flex items-center">
                          <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                          Signing in...
                        </span>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
            
            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle>Create an account</CardTitle>
                  <CardDescription>
                    Join our community of fragrance enthusiasts
                  </CardDescription>
                </CardHeader>
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          {...registerForm.register("firstName")}
                          placeholder="John"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          {...registerForm.register("lastName")}
                          placeholder="Doe"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        {...registerForm.register("email")}
                        placeholder="john.doe@example.com"
                      />
                      {registerForm.formState.errors.email && (
                        <p className="text-sm text-red-500">
                          {registerForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        {...registerForm.register("username")}
                        placeholder="johndoe"
                      />
                      {registerForm.formState.errors.username && (
                        <p className="text-sm text-red-500">
                          {registerForm.formState.errors.username.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        {...registerForm.register("password")}
                        placeholder="Create a password"
                      />
                      {registerForm.formState.errors.password && (
                        <p className="text-sm text-red-500">
                          {registerForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        {...registerForm.register("confirmPassword")}
                        placeholder="Confirm your password"
                      />
                      {registerForm.formState.errors.confirmPassword && (
                        <p className="text-sm text-red-500">
                          {registerForm.formState.errors.confirmPassword.message}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isSeller"
                        checked={registerForm.watch("isSeller")}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          registerForm.setValue("isSeller", isChecked);
                        }}
                      />
                      <Label htmlFor="isSeller">I want to sell perfumes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isAdmin"
                        checked={registerForm.watch("isAdmin")}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          registerForm.setValue("isAdmin", isChecked);
                        }}
                      />
                      <Label htmlFor="isAdmin" className="text-amber-600 font-medium">Admin account (development only)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="terms"
                        checked={termsAccepted}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          setTermsAccepted(isChecked);
                          registerForm.setValue("terms", isChecked, { shouldValidate: true });
                        }}
                      />
                      <Label htmlFor="terms">
                        I agree to the{" "}
                        <a href="#" className="text-amber-600 hover:underline">
                          terms and conditions
                        </a>
                      </Label>
                    </div>
                    {registerForm.formState.errors.terms && (
                      <p className="text-sm text-red-500">
                        {registerForm.formState.errors.terms.message}
                      </p>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button 
                      type="submit" 
                      className="w-full bg-amber-500 text-black font-semibold hover:bg-amber-600"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? (
                        <span className="flex items-center">
                          <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                          Creating account...
                        </span>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
            
            <TabsContent value="forgot">
              <Card>
                <CardHeader>
                  <CardTitle>Reset your password</CardTitle>
                  <CardDescription>
                    We'll send you a verification code to reset your password
                  </CardDescription>
                </CardHeader>
                
                {resetStep === "email" && (
                  <form onSubmit={forgotPasswordForm.handleSubmit(onForgotPasswordSubmit)}>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reset-email">Email</Label>
                        <Input
                          id="reset-email"
                          type="email"
                          {...forgotPasswordForm.register("email")}
                          placeholder="Enter your email address"
                        />
                        {forgotPasswordForm.formState.errors.email && (
                          <p className="text-sm text-red-500">
                            {forgotPasswordForm.formState.errors.email.message}
                          </p>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                      <Button 
                        type="submit" 
                        className="w-full bg-amber-500 text-black font-semibold hover:bg-amber-600"
                        disabled={forgotPasswordMutation.isPending}
                      >
                        {forgotPasswordMutation.isPending ? (
                          <span className="flex items-center">
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                            Sending verification code...
                          </span>
                        ) : (
                          "Send verification code"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => setActiveTab("login")}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to login
                      </Button>
                    </CardFooter>
                  </form>
                )}
                
                {resetStep === "code" && (
                  <form onSubmit={verifyCodeForm.handleSubmit(onVerifyCodeSubmit)}>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="verification-code">Verification Code</Label>
                        <p className="text-sm text-gray-500 mb-4">
                          Enter the 6-digit code sent to {resetEmail}
                        </p>
                        <div className="flex justify-center py-4">
                          <InputOTP
                            maxLength={6}
                            containerClassName="gap-2"
                            value={verifyCodeForm.watch("code")}
                            onChange={(value) => verifyCodeForm.setValue("code", value, { shouldValidate: true })}
                            render={({ slots }) => (
                              <InputOTPGroup>
                                {slots.map((slot, index) => (
                                  <InputOTPSlot 
                                    key={index} 
                                    {...slot}
                                    className="w-10 h-12 text-center text-lg border-amber-300 focus:border-amber-500 focus:ring-amber-500"
                                    index={index}
                                  />
                                ))}
                              </InputOTPGroup>
                            )}
                          />
                        </div>
                        {verifyCodeForm.formState.errors.code && (
                          <p className="text-sm text-red-500 text-center">
                            {verifyCodeForm.formState.errors.code.message}
                          </p>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                      <Button 
                        type="submit" 
                        className="w-full bg-amber-500 text-black font-semibold hover:bg-amber-600"
                        disabled={verifyCodeMutation.isPending}
                      >
                        {verifyCodeMutation.isPending ? (
                          <span className="flex items-center">
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                            Verifying code...
                          </span>
                        ) : (
                          "Verify code"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => setResetStep("email")}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                    </CardFooter>
                  </form>
                )}
                
                {resetStep === "password" && (
                  <form onSubmit={resetPasswordForm.handleSubmit(onResetPasswordSubmit)}>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-password">New Password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          {...resetPasswordForm.register("newPassword")}
                          placeholder="Enter your new password"
                        />
                        {resetPasswordForm.formState.errors.newPassword && (
                          <p className="text-sm text-red-500">
                            {resetPasswordForm.formState.errors.newPassword.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                        <Input
                          id="confirm-new-password"
                          type="password"
                          {...resetPasswordForm.register("confirmNewPassword")}
                          placeholder="Confirm your new password"
                        />
                        {resetPasswordForm.formState.errors.confirmNewPassword && (
                          <p className="text-sm text-red-500">
                            {resetPasswordForm.formState.errors.confirmNewPassword.message}
                          </p>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                      <Button 
                        type="submit" 
                        className="w-full bg-amber-500 text-black font-semibold hover:bg-amber-600"
                        disabled={resetPasswordMutation.isPending}
                      >
                        {resetPasswordMutation.isPending ? (
                          <span className="flex items-center">
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                            Resetting password...
                          </span>
                        ) : (
                          "Reset password"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => setResetStep("code")}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                    </CardFooter>
                  </form>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
      {/* Right side - Hero image and content */}
      <div 
        className="hidden md:block md:w-1/2 bg-cover bg-center" 
        style={{ 
          backgroundImage: "url('https://images.unsplash.com/photo-1615634376658-c80abf877da2?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80')" 
        }}
      >
        <div className="h-full w-full bg-rich-black/70 flex items-center">
          <div className="p-12 text-white max-w-md mx-auto">
            <h2 className="font-playfair text-3xl font-bold mb-4">Discover the World of Luxury Fragrances</h2>
            <p className="mb-6">
              Join our exclusive marketplace where perfume enthusiasts and artisanal perfumers come together to celebrate the art of fragrance.
            </p>
            <ul className="space-y-4">
              <li className="flex items-center">
                <ArrowRight className="h-5 w-5 text-gold mr-2" />
                <span>Access to exclusive niche fragrances</span>
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-5 w-5 text-gold mr-2" />
                <span>Connect with independent perfumers</span>
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-5 w-5 text-gold mr-2" />
                <span>Personalized fragrance recommendations</span>
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-5 w-5 text-gold mr-2" />
                <span>Early access to new releases</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

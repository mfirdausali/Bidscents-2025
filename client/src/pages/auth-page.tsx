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
import { ArrowRight, Mail, Lock, User, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Extended schemas with validation
const loginSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

const emailLoginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

const resetPasswordSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
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

type LoginFormValues = z.infer<typeof loginSchema>;
type EmailLoginFormValues = z.infer<typeof emailLoginSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [location, navigate] = useLocation();
  const { 
    user, 
    loginMutation, 
    loginWithEmailMutation,
    registerMutation, 
    registerWithVerificationMutation,
    resetPasswordMutation,
    isEmailVerified,
    setIsEmailVerified
  } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [useEmailLogin, setUseEmailLogin] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  
  // Get tab from URL query parameter and other URL parameters
  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1]);
    
    // Tab selection
    const tab = params.get("tab");
    if (tab === "register") {
      setActiveTab("register");
    }
    
    // Check if coming from successful registration
    if (params.get("registration") === "success") {
      setRegistrationSuccess(true);
    }
    
    // Check if coming from reset password request
    if (params.get("reset") === "requested") {
      setResetRequested(true);
    }
    
    // Check if email is verified
    if (params.get("verified") === "true") {
      setIsEmailVerified(true);
    }
  }, [location, setIsEmailVerified]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  // Login form (username)
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Login form (email)
  const emailLoginForm = useForm<EmailLoginFormValues>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });
  
  // Reset password form
  const resetPasswordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: "",
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
      isSeller: true,
      isAdmin: false,
      terms: false,
    },
  });

  const onLoginSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(data);
  };
  
  const onEmailLoginSubmit = (data: EmailLoginFormValues) => {
    loginWithEmailMutation.mutate(data);
  };
  
  const onResetPasswordSubmit = (data: ResetPasswordFormValues) => {
    resetPasswordMutation.mutate(data);
  };

  const onRegisterSubmit = (data: RegisterFormValues) => {
    // Remove confirmPassword and terms from data before sending to API
    const { confirmPassword, terms, ...registerData } = data;
    
    // Use the new verification-based registration with Supabase Auth
    registerWithVerificationMutation.mutate({
      username: registerData.username,
      email: registerData.email,
      password: registerData.password,
      firstName: registerData.firstName,
      lastName: registerData.lastName
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
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>
                    Sign in to your account to continue
                  </CardDescription>
                </CardHeader>
                
                {isEmailVerified && (
                  <Alert className="mx-6 mb-4 bg-green-50 border-green-200">
                    <AlertCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-600">Email verified</AlertTitle>
                    <AlertDescription className="text-green-700">
                      Your email has been successfully verified. You can now log in.
                    </AlertDescription>
                  </Alert>
                )}
                
                {registrationSuccess && (
                  <Alert className="mx-6 mb-4 bg-blue-50 border-blue-200">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-600">Check your email</AlertTitle>
                    <AlertDescription className="text-blue-700">
                      We've sent you a verification email. Please check your inbox and click the verification link.
                    </AlertDescription>
                  </Alert>
                )}
                
                {resetRequested && (
                  <Alert className="mx-6 mb-4 bg-blue-50 border-blue-200">
                    <Lock className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-600">Password reset email sent</AlertTitle>
                    <AlertDescription className="text-blue-700">
                      Check your email for instructions to reset your password.
                    </AlertDescription>
                  </Alert>
                )}
                
                {showResetPassword ? (
                  <>
                    <form onSubmit={resetPasswordForm.handleSubmit(onResetPasswordSubmit)}>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Email</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            {...resetPasswordForm.register("email")}
                            placeholder="Enter your email address"
                          />
                          {resetPasswordForm.formState.errors.email && (
                            <p className="text-sm text-red-500">
                              {resetPasswordForm.formState.errors.email.message}
                            </p>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter className="flex-col space-y-2">
                        <Button 
                          type="submit" 
                          className="w-full bg-amber-500 text-black font-semibold hover:bg-amber-600"
                          disabled={resetPasswordMutation.isPending}
                        >
                          {resetPasswordMutation.isPending ? (
                            <span className="flex items-center">
                              <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                              Sending...
                            </span>
                          ) : (
                            "Send Reset Link"
                          )}
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost"
                          className="w-full text-sm"
                          onClick={() => setShowResetPassword(false)}
                        >
                          Back to login
                        </Button>
                      </CardFooter>
                    </form>
                  </>
                ) : useEmailLogin ? (
                  <>
                    <form onSubmit={emailLoginForm.handleSubmit(onEmailLoginSubmit)}>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="login-email">Email</Label>
                          <Input
                            id="login-email"
                            type="email"
                            {...emailLoginForm.register("email")}
                            placeholder="Enter your email"
                          />
                          {emailLoginForm.formState.errors.email && (
                            <p className="text-sm text-red-500">
                              {emailLoginForm.formState.errors.email.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Label htmlFor="login-email-password">Password</Label>
                            <button 
                              type="button"
                              onClick={() => setShowResetPassword(true)}
                              className="text-sm text-gold hover:underline"
                            >
                              Forgot password?
                            </button>
                          </div>
                          <Input
                            id="login-email-password"
                            type="password"
                            {...emailLoginForm.register("password")}
                            placeholder="Enter your password"
                          />
                          {emailLoginForm.formState.errors.password && (
                            <p className="text-sm text-red-500">
                              {emailLoginForm.formState.errors.password.message}
                            </p>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter className="flex-col space-y-2">
                        <Button 
                          type="submit" 
                          className="w-full bg-amber-500 text-black font-semibold hover:bg-amber-600"
                          disabled={loginWithEmailMutation.isPending}
                        >
                          {loginWithEmailMutation.isPending ? (
                            <span className="flex items-center">
                              <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                              Signing in...
                            </span>
                          ) : (
                            "Sign In with Email"
                          )}
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost"
                          className="w-full text-sm"
                          onClick={() => setUseEmailLogin(false)}
                        >
                          Sign in with username instead
                        </Button>
                      </CardFooter>
                    </form>
                  </>
                ) : (
                  <>
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
                              onClick={() => setShowResetPassword(true)}
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
                      <CardFooter className="flex-col space-y-2">
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
                        <Button 
                          type="button" 
                          variant="ghost"
                          className="w-full text-sm"
                          onClick={() => setUseEmailLogin(true)}
                        >
                          Sign in with email instead
                        </Button>
                      </CardFooter>
                    </form>
                  </>
                )}
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
                    {/* <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isSeller"
                        checked={registerForm.watch("isSeller")}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          registerForm.setValue("isSeller", isChecked);
                        }}
                      />
                      <Label htmlFor="isSeller">I want to sell perfumes</Label>
                    </div> */}
                    {/* <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isAdmin"
                        checked={registerForm.watch("isAdmin")}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          registerForm.setValue("isAdmin", isChecked);
                        }}
                      />
                      <Label htmlFor="isAdmin" className="text-amber-600 font-medium">Admin account (development only)</Label>
                    </div> */}
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
                      disabled={registerWithVerificationMutation.isPending}
                    >
                      {registerWithVerificationMutation.isPending ? (
                        <span className="flex items-center">
                          <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                          Setting up account...
                        </span>
                      ) : (
                        "Create Account with Email Verification"
                      )}
                    </Button>
                  </CardFooter>
                </form>
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

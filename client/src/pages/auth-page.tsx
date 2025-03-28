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
import { ArrowRight } from "lucide-react";

// Extended schemas with validation
const loginSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

// Create a custom schema for registration that includes terms field
const registerSchema = z.object({
  ...insertUserSchema.shape,
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string(),
  email: z.string().email({ message: "Please enter a valid email address" }),
  terms: z.boolean().refine(val => val === true, {
    message: "You must accept the terms and conditions",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [location, navigate] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");
  
  // Get tab from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1]);
    const tab = params.get("tab");
    if (tab === "register") {
      setActiveTab("register");
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
      isBanned: false,
      terms: false,
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
                        <a href="#" className="text-sm text-gold hover:underline">
                          Forgot password?
                        </a>
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
                      className="w-full bg-gold text-rich-black hover:bg-metallic-gold"
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
                        onCheckedChange={(checked) => 
                          registerForm.setValue("isSeller", checked === true)
                        }
                      />
                      <Label htmlFor="isSeller" className="cursor-pointer" onClick={() => 
                        registerForm.setValue("isSeller", !registerForm.watch("isSeller"))
                      }>
                        I want to sell perfumes
                      </Label>
                    </div>
                    {/* Dev mode admin checkbox */}
                    {import.meta.env.DEV && (
                      <div className="flex items-center space-x-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                        <Checkbox
                          id="isAdmin"
                          checked={registerForm.watch("isAdmin")}
                          onCheckedChange={(checked) => 
                            registerForm.setValue("isAdmin", checked === true)
                          }
                        />
                        <Label htmlFor="isAdmin" className="text-amber-800 cursor-pointer" onClick={() => 
                          registerForm.setValue("isAdmin", !registerForm.watch("isAdmin"))
                        }>
                          <strong>DEV MODE:</strong> Register as admin
                        </Label>
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="terms"
                        checked={registerForm.watch("terms")}
                        onCheckedChange={(checked) => 
                          registerForm.setValue("terms", checked === true, { 
                            shouldValidate: true 
                          })
                        }
                      />
                      <Label htmlFor="terms" className="cursor-pointer" onClick={() => 
                        registerForm.setValue("terms", !registerForm.watch("terms"), {
                          shouldValidate: true
                        })
                      }>
                        I agree to the{" "}
                        <a href="#" className="text-gold hover:underline">
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
                      className="w-full bg-gold text-rich-black hover:bg-metallic-gold"
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

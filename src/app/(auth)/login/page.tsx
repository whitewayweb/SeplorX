"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/atoms/password-input";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isPending, setIsPending] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsPending(true);

        const { error: signInError } = await signIn.email({
            email,
            password,
        });

        if (signInError) {
            setError(signInError.message || "Invalid credentials.");
        } else {
            router.push("/");
        }

        setIsPending(false);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="flex flex-col items-center space-y-2 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Package className="h-6 w-6" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
                    <p className="text-sm text-muted-foreground">
                        Sign in to your SeplorX account
                    </p>
                </div>

                <Card>
                    <form onSubmit={handleSubmit}>
                        <CardHeader className="space-y-1">
                            <CardTitle className="text-xl">Sign in</CardTitle>
                            <FieldDescription>
                                Enter your email and password below to login
                            </FieldDescription>
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="gap-4">
                                <Field data-invalid={Boolean(error)}>
                                    <FieldLabel htmlFor="email">Email</FieldLabel>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        placeholder="m@example.com"
                                        required
                                        aria-invalid={Boolean(error)}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </Field>
                                <Field data-invalid={Boolean(error)}>
                                    <div className="flex items-center justify-between">
                                        <FieldLabel htmlFor="password">Password</FieldLabel>
                                        <a href="#" className="text-xs font-medium text-primary hover:underline">
                                            Forgot password?
                                        </a>
                                    </div>
                                    <PasswordInput
                                        id="password"
                                        name="password"
                                        required
                                        aria-invalid={Boolean(error)}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </Field>

                                <FieldError>{error}</FieldError>
                            </FieldGroup>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full" disabled={isPending}>
                                {isPending ? "Signing in..." : "Sign in"}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}

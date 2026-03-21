"use client";

import { useState, useActionState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { User, Lock, Mail, Loader2 } from "lucide-react";
import { updateProfileName, updateProfilePassword } from "./actions";

interface ProfileFormProps {
    userName: string;
    userEmail: string;
}

export function ProfileForm({ userName, userEmail }: ProfileFormProps) {
    const [name, setName] = useState(userName);

    // Name update via server action
    const [nameState, nameAction, isUpdatingName] = useActionState(
        async (prev: unknown, formData: FormData) => {
            const result = await updateProfileName(prev, formData);
            if (result.success) {
                toast.success("Profile name updated successfully.");
            } else if (result.error) {
                toast.error(result.error);
            }
            return result;
        },
        null,
    );

    // Password update via server action
    const [, passwordAction, isUpdatingPassword] = useActionState(
        async (prev: unknown, formData: FormData) => {
            const result = await updateProfilePassword(prev, formData);
            if (result.success) {
                toast.success("Password updated successfully.");
                // Reset password fields by resetting the form
                const form = document.getElementById("password-form") as HTMLFormElement;
                form?.reset();
            } else if (result.error) {
                toast.error(result.error);
            }
            return result;
        },
        null,
    );

    return (
        <div className="p-6 space-y-8">
            <div className="space-y-0.5">
                <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
                <p className="text-muted-foreground">
                    Manage your account settings and preferences.
                </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <User className="h-5 w-5" />
                            Personal Information
                        </CardTitle>
                        <CardDescription>
                            Update your name and email address.
                        </CardDescription>
                    </CardHeader>
                    <form action={nameAction}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your Name"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <div className="relative">
                                    <Input
                                        id="email"
                                        value={userEmail}
                                        disabled
                                        className="bg-muted pl-9"
                                    />
                                    <Mail className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                                </div>
                                <p className="text-[0.8rem] text-muted-foreground">
                                    Email cannot be changed here.
                                </p>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isUpdatingName || name === userName}>
                                {isUpdatingName ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : "Save Changes"}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Lock className="h-5 w-5" />
                            Security
                        </CardTitle>
                        <CardDescription>
                            Change your password to keep your account secure.
                        </CardDescription>
                    </CardHeader>
                    <form id="password-form" action={passwordAction}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="currentPassword">Current Password</Label>
                                <Input
                                    id="currentPassword"
                                    name="currentPassword"
                                    type="password"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password</Label>
                                <Input
                                    id="newPassword"
                                    name="newPassword"
                                    type="password"
                                    required
                                    minLength={8}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    required
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" variant="default" disabled={isUpdatingPassword}>
                                {isUpdatingPassword ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Updating...
                                    </>
                                ) : "Update Password"}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>

            {/* Suppress unused-variable lint — nameState drives re-renders for toast feedback */}
            <span className="hidden">{nameState === null ? "" : ""}</span>
        </div>
    );
}

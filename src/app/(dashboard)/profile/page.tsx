"use client";

import { useState } from "react";
import { useSession, updateUser, changePassword } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { User, Lock, Mail, Loader2 } from "lucide-react";

export default function ProfilePage() {
    const { data: session, isPending: sessionPending } = useSession();
    const [name, setName] = useState(session?.user?.name || "");
    const [isUpdatingName, setIsUpdatingName] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

    if (sessionPending) {
        return (
            <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const handleUpdateName = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsUpdatingName(true);

        const { error } = await updateUser({
            name: name,
        });

        if (error) {
            toast.error(error.message || "Failed to update profile name.");
        } else {
            toast.success("Profile name updated successfully.");
        }

        setIsUpdatingName(false);
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match.");
            return;
        }

        setIsUpdatingPassword(true);

        const { error } = await changePassword({
            newPassword: newPassword,
            currentPassword: currentPassword,
            revokeOtherSessions: true,
        });

        if (error) {
            toast.error(error.message || "Failed to update password.");
        } else {
            toast.success("Password updated successfully.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        }

        setIsUpdatingPassword(false);
    };

    return (
        <div className="container max-w-4xl space-y-8 py-8">
            <div className="space-y-0.5">
                <h2 className="text-2xl font-bold tracking-tight">Profile Settings</h2>
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
                    <form onSubmit={handleUpdateName}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
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
                                        value={session?.user?.email || ""}
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
                            <Button type="submit" disabled={isUpdatingName || name === session?.user?.name}>
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
                    <form onSubmit={handleUpdatePassword}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="current-password">Current Password</Label>
                                <Input
                                    id="current-password"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="new-password">New Password</Label>
                                <Input
                                    id="new-password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirm-password">Confirm New Password</Label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" variant="default" disabled={isUpdatingPassword || !newPassword}>
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
        </div>
    );
}

import { getAuthenticatedSession } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
    const session = await getAuthenticatedSession();

    return (
        <ProfileForm
            userName={session.user.name}
            userEmail={session.user.email}
        />
    );
}

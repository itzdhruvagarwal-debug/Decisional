"use client";

import type { User } from "./ProfileTab";
import ContactVerificationPanel from "./ContactVerificationPanel";
import PasswordPanel from "./PasswordPanel";
import TwoFactorAuthPanel from "./TwoFactorAuthPanel";
import LoginActivityPanel from "./LoginActivityPanel";
import DeleteAccountPanel from "./DeleteAccountPanel";

interface SecurityTabProps {
    user: User;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    isSaving: boolean;
    setIsSaving: (val: boolean) => void;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

export default function SecurityTab({
    user,
    setUser,
    isSaving,
    setIsSaving,
    showToast,
}: Readonly<SecurityTabProps>) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: "24px",
            }}
        >
            <ContactVerificationPanel
                user={user}
                setUser={setUser}
                isSaving={isSaving}
                setIsSaving={setIsSaving}
                showToast={showToast}
            />

            <PasswordPanel
                user={user}
                isSaving={isSaving}
                setIsSaving={setIsSaving}
                showToast={showToast}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <TwoFactorAuthPanel
                    isSaving={isSaving}
                    setIsSaving={setIsSaving}
                    showToast={showToast}
                />

                <LoginActivityPanel
                    showToast={showToast}
                />

                <DeleteAccountPanel
                    isSaving={isSaving}
                    setIsSaving={setIsSaving}
                    showToast={showToast}
                />
            </div>
        </div>
    );
}

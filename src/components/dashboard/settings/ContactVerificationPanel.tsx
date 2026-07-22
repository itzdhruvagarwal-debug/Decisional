"use client";


import { logger } from "@/lib/logger-client";
import { useState } from "react";
import type { User } from "./ProfileTab";
import { Button, Input } from "@/components/ui";

interface ContactVerificationPanelProps {
    user: User;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    isSaving: boolean;
    setIsSaving: (val: boolean) => void;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

export default function ContactVerificationPanel({
    user,
    setUser,
    isSaving,
    setIsSaving,
    showToast,
}: Readonly<ContactVerificationPanelProps>) {
    // verifyContactState manages initial verification of unverified email/phone records.
    const [verifyContactState, setVerifyContactState] = useState<{
        type: 'email' | 'phone' | null;
        step: 'idle' | 'input' | 'code';
    }>({ type: null, step: 'idle' });
    const [contactVerifyCode, setContactVerifyCode] = useState("");
    const [pendingContact, setPendingContact] = useState("");

    // changeContactState controls the secure multi-stage contact change workflow:
    // 1. 'verify-current': Verifies OTPs sent to current active communication channels to prove identity.
    // 2. 'enter-new': Accepts the desired new email or phone number.
    // 3. 'verify-new': Sends and verifies an OTP on the new channel to ensure it is active before commit.
    const [changeContactState, setChangeContactState] = useState<{
        active: boolean;
        type: 'email' | 'phone' | null;
        step: 'idle' | 'verify-current' | 'enter-new' | 'verify-new';
        currentEmailOtp: string;
        currentPhoneOtp: string;
        newContact: string;
        newOtp: string;
    }>({
        active: false,
        type: null,
        step: 'idle',
        currentEmailOtp: '',
        currentPhoneOtp: '',
        newContact: '',
        newOtp: '',
    });

    const handleStartContactChange = async (type: 'email' | 'phone') => {
        if (!user?.email && !user?.phone) {
            showToast("No available contact method to verify. Please contact support.", "error");
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/change-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "init" }),
            });
            const data = await res.json();
            if (res.ok) {
                setChangeContactState(prev => ({ ...prev, active: true, type, step: 'verify-current' }));
            } else {
                showToast(data.error || "Failed to initiate contact change", "error");
            }
        } catch (err: unknown) {
            logger.error("[change-contact] start contact change error:", err);
            showToast("Network error.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleVerifyCurrentContacts = async () => {
        if (user?.email && !changeContactState.currentEmailOtp) {
            showToast("Please enter the Email OTP", "error"); return;
        }
        if (user?.phone && !changeContactState.currentPhoneOtp) {
            showToast("Please enter the Phone OTP", "error"); return;
        }
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/change-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "verify-current",
                    currentEmailOtp: changeContactState.currentEmailOtp || undefined,
                    currentPhoneOtp: changeContactState.currentPhoneOtp || undefined
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setChangeContactState(prev => ({ ...prev, step: 'enter-new' }));
            } else {
                showToast(data.error || "Invalid OTP(s)", "error");
            }
        } catch (err: unknown) {
            logger.error("[change-contact] verify current error:", err);
            showToast("Network error", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSendNewContactOtp = async () => {
        if (!changeContactState.newContact) { showToast(`Please enter your new ${changeContactState.type}`, "error"); return; }
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/change-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send-new", type: changeContactState.type, newContact: changeContactState.newContact }),
            });
            const data = await res.json();
            if (res.ok) {
                setChangeContactState(prev => ({ ...prev, step: 'verify-new' }));
                showToast(`OTP sent to new ${changeContactState.type}`, "success");
            } else { showToast(data.error || "Failed to send OTP", "error"); }
        } catch (err: unknown) {
            logger.error("[change-contact] send new OTP error:", err);
            showToast("Network error", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmNewContact = async () => {
        if (!changeContactState.newOtp) { showToast("Please enter the OTP", "error"); return; }
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/change-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "confirm-new", type: changeContactState.type, newContact: changeContactState.newContact, newOtp: changeContactState.newOtp }),
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`${changeContactState.type} updated successfully!`, "success");
                setChangeContactState({ active: false, type: null, step: 'idle', currentEmailOtp: '', currentPhoneOtp: '', newContact: '', newOtp: '' });
                window.location.reload(); // Refresh to reflect new session data
            } else { showToast(data.error || "Invalid OTP", "error"); }
        } catch (err: unknown) {
            logger.error("[change-contact] confirm new contact error:", err);
            showToast("Network error", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const renderEmailAction = () => {
        if (user?.emailVerified && user?.email) {
            return (
                <div className="flex gap-2 items-center">
                    <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '5px 12px', borderRadius: '20px' }}>
                        ✅ Verified
                    </span>
                <Button variant="secondary" disabled={isSaving} className="text-xs" style={{ padding: '4px 8px' }} onClick={() => handleStartContactChange('email')}>{isSaving ? '...' : 'Change'}</Button>
                </div>
            );
        }
        if (verifyContactState.type === 'email' && verifyContactState.step === 'code') {
            return (
                <div className="flex gap-2">
                    <Input type="text" id="email-verify-code" placeholder="OTP" aria-label="Email verification code" className="text-xs" style={{ width: '80px', padding: '4px 8px' }} value={contactVerifyCode} onChange={(e) => setContactVerifyCode(e.target.value)} />
                    <Button variant="primary" onClick={async () => {
                        const res = await fetch('/api/user/verify-contact', { method: 'POST', body: JSON.stringify({ type: 'email', code: contactVerifyCode }) });
                        if (res.ok) {
                            showToast('Email Verified!', 'success');
                            setVerifyContactState({ type: null, step: 'idle' });
                            setContactVerifyCode('');
                            setUser(prev => prev ? { ...prev, emailVerified: true } : null);
                        } else { showToast('Invalid code', 'error'); }
                    }} className="text-xs" style={{ padding: '4px 8px' }}>Verify</Button>
                </div>
            );
        }
        return (
            <Button variant="secondary" disabled={isSaving} onClick={async () => {
                if (!user?.email) { showToast('No email found to verify.', 'error'); return; }
                setIsSaving(true);
                try {
                    const res = await fetch("/api/user/send-otp", {
                        method: "POST",
                        body: JSON.stringify({ type: 'email', contact: user.email })
                    });
                    if (res.ok) {
                        showToast(`Verification code sent to ${user.email}`, 'success');
                        setVerifyContactState({ type: 'email', step: 'code' });
                    } else {
                        const errorData = await res.json();
                        showToast(errorData.error || 'Failed to send OTP to email.', 'error');
                    }
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Error occurred';
                    showToast(msg, 'error');
                } finally {
                    setIsSaving(false);
                }
            }} className="text-xs" style={{ padding: '6px 12px' }}>
                Verify Email
            </Button>
        );
    };

    const renderPhoneAction = () => {
        if (user?.phoneVerified && user?.phone) {
            return (
                <div className="flex gap-2 items-center">
                    <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '5px 12px', borderRadius: '20px' }}>
                        ✅ Verified
                    </span>
                    <Button variant="secondary" disabled={isSaving} className="text-xs" style={{ padding: '4px 8px' }} onClick={() => handleStartContactChange('phone')}>{isSaving ? '...' : 'Change'}</Button>
                </div>
            );
        }
        if (verifyContactState.type === 'phone' && verifyContactState.step === 'code') {
            return (
                <div className="flex gap-2">
                    <Input type="text" id="phone-verify-code" placeholder="OTP" aria-label="Phone verification code" className="text-xs" style={{ width: '80px', padding: '4px 8px' }} value={contactVerifyCode} onChange={(e) => setContactVerifyCode(e.target.value)} />
                    <Button variant="primary" onClick={async () => {
                        const res = await fetch('/api/user/verify-contact', { method: 'POST', body: JSON.stringify({ type: 'phone', code: contactVerifyCode }) });
                        if (res.ok) {
                            showToast('Phone Verified!', 'success');
                            setVerifyContactState({ type: null, step: 'idle' });
                            setContactVerifyCode('');
                            setUser(prev => {
                                if (!prev) return null;
                                const nextUser: User = { ...prev, phoneVerified: true };
                                const p = pendingContact || prev.phone;
                                if (p) nextUser.phone = p;
                                return nextUser;
                            });
                        } else { showToast('Invalid code', 'error'); }
                    }} className="text-xs" style={{ padding: '4px 8px' }}>Verify</Button>
                </div>
            );
        }
        if (verifyContactState.type === 'phone' && verifyContactState.step === 'input') {
            return (
                <div className="flex gap-2">
                    <Input type="text" aria-label="Phone number with country code" placeholder="e.g. 919876543210" className="text-xs" style={{ width: '130px', padding: '4px 8px' }} value={pendingContact} onChange={(e) => setPendingContact(e.target.value)} />
                    <Button variant="primary" disabled={isSaving} onClick={async () => {
                        if (pendingContact) {
                            setIsSaving(true);
                            try {
                                const res = await fetch('/api/user/send-otp', {
                                    method: 'POST',
                                    body: JSON.stringify({ type: 'phone', contact: pendingContact })
                                });
                                if (res.ok) {
                                    showToast(`OTP sent to ${pendingContact}`, 'success');
                                    setVerifyContactState({ type: 'phone', step: 'code' });
                                } else {
                                    const errorData = await res.json();
                                    showToast(errorData.error || 'Failed to send OTP to phone. Ensure correct country code is used.', 'error');
                                }
                            } catch (err: unknown) {
                                const msg = err instanceof Error ? err.message : 'Error occurred';
                                showToast(msg, 'error');
                            } finally {
                                setIsSaving(false);
                            }
                        }
                    }} className="text-xs" style={{ padding: '4px 8px' }}>
                        {isSaving ? '...' : 'Send OTP'}
                    </Button>
                </div>
            );
        }
        return (
            <Button variant="secondary" disabled={isSaving} onClick={() => {
                setPendingContact('');
                setVerifyContactState({ type: 'phone', step: 'input' });
            }} className="text-xs" style={{ padding: '6px 12px' }}>
                Add & Verify
            </Button>
        );
    };

    return (
        <div className="card">
            <h3 className="text-xl font-bold mb-6">
                Contact Verification
            </h3>
            <div className="flex flex-col gap-4">
                {/* Email Verification */}
                <div className="flex justify-between items-center p-3" style={{ background: (user?.emailVerified && user?.email) ? 'rgba(16, 185, 129, 0.06)' : 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-sm)', border: (user?.emailVerified && user?.email) ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent' }}>
                    <div>
                        <div className="font-semibold text-sm">📧 Email Address</div>
                        <div className="text-xs text-muted">{user?.email || 'N/A'}</div>
                    </div>
                    {renderEmailAction()}
                </div>
 
                {/* Phone Verification */}
                <div className="flex justify-between items-center p-3" style={{ background: (user?.phoneVerified && user?.phone) ? 'rgba(16, 185, 129, 0.06)' : 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-sm)', border: (user?.phoneVerified && user?.phone) ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent' }}>
                    <div>
                        <div className="font-semibold text-sm">📱 Phone Number</div>
                        <div className="text-xs text-muted">
                            {user?.phoneVerified && user?.phone ? `+91-${user.phone}` : 'Required for campaign payout calls'}
                        </div>
                    </div>
                    {renderPhoneAction()}
                </div>
            </div>

            {/* Change Contact Inline UI */}
            {changeContactState.active && (
                <div className="p-4" style={{ marginTop: '20px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-base font-semibold" style={{ margin: 0 }}>Change {changeContactState.type === 'email' ? 'Email Address' : 'Phone Number'}</h4>
                        <Button variant="ghost" aria-label="Dismiss contact change dialog" className="text-muted cursor-pointer" style={{ background: 'none', border: 'none' }} onClick={() => setChangeContactState({ active: false, type: null, step: 'idle', currentEmailOtp: '', currentPhoneOtp: '', newContact: '', newOtp: '' })}>✕</Button>
                    </div>

                    {changeContactState.step === 'verify-current' && (
                        <div className="flex flex-col gap-3">
                            <div className="text-sm text-secondary">To protect your account, we've sent an OTP to your current contact method(s). Please enter the OTP to continue.</div>
                            {user?.email && (
                                <div>
                                    <label className="label" htmlFor="verify-current-email-otp">OTP from Email</label>
                                    <Input id="verify-current-email-otp" type="text" placeholder="e.g. 123456" value={changeContactState.currentEmailOtp} onChange={e => setChangeContactState({ ...changeContactState, currentEmailOtp: e.target.value })} fullWidth />
                                </div>
                            )}
                            {user?.phone && (
                                <div>
                                    <label className="label" htmlFor="verify-current-phone-otp">OTP from Phone</label>
                                    <Input id="verify-current-phone-otp" type="text" placeholder="e.g. 123456" value={changeContactState.currentPhoneOtp} onChange={e => setChangeContactState({ ...changeContactState, currentPhoneOtp: e.target.value })} fullWidth />
                                </div>
                            )}
                            <Button variant="primary" onClick={handleVerifyCurrentContacts} disabled={isSaving}>Verify & Continue</Button>
                        </div>
                    )}

                    {changeContactState.step === 'enter-new' && (
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="label" htmlFor="verify-new-contact">Enter your new {changeContactState.type}</label>
                                <Input id="verify-new-contact" type={changeContactState.type === 'email' ? 'email' : 'text'} placeholder={`New ${changeContactState.type}`} value={changeContactState.newContact} onChange={e => setChangeContactState({ ...changeContactState, newContact: e.target.value })} fullWidth />
                            </div>
                            <Button variant="primary" onClick={handleSendNewContactOtp} disabled={isSaving}>Send OTP to New {changeContactState.type}</Button>
                        </div>
                    )}

                    {changeContactState.step === 'verify-new' && (
                        <div className="flex flex-col gap-3">
                            <div className="text-sm text-secondary">We've sent an OTP to {changeContactState.newContact}.</div>
                            <div>
                                <label className="label" htmlFor="verify-new-contact-otp">Enter OTP</label>
                                <Input id="verify-new-contact-otp" type="text" placeholder="e.g. 123456" value={changeContactState.newOtp} onChange={e => setChangeContactState({ ...changeContactState, newOtp: e.target.value })} fullWidth />
                            </div>
                            <Button variant="primary" onClick={handleConfirmNewContact} disabled={isSaving}>Confirm & Save</Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

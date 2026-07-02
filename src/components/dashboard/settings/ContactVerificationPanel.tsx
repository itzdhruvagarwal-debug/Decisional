"use client";

import { useState } from "react";
import type { User } from "./ProfileTab";

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
}: ContactVerificationPanelProps) {
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
        } catch (_e) {
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
        } catch (_e) { showToast("Network error", "error"); } finally { setIsSaving(false); }
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
        } catch (_e) { showToast("Network error", "error"); } finally { setIsSaving(false); }
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
        } catch (_e) { showToast("Network error", "error"); } finally { setIsSaving(false); }
    };

    return (
        <div className="card">
            <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>
                Contact Verification
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Email Verification */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px',
                    background: (user?.emailVerified && user?.email) ? 'rgba(16, 185, 129, 0.06)' : 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    border: (user?.emailVerified && user?.email) ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
                }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>📧 Email Address</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{user?.email || 'N/A'}</div>
                    </div>
                    {(user?.emailVerified && user?.email) ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                fontSize: '12px', fontWeight: 700, color: '#10b981',
                                background: 'rgba(16, 185, 129, 0.1)', padding: '5px 12px',
                                borderRadius: '20px',
                            }}>
                                ✅ Verified
                            </span>
                            <button className="btn btn-secondary btn-sm" disabled={isSaving} style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => handleStartContactChange('email')}>{isSaving ? '...' : 'Change'}</button>
                        </div>
                    ) : verifyContactState.type === 'email' && verifyContactState.step === 'code' ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="OTP" className="input" style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }} value={contactVerifyCode} onChange={(e) => setContactVerifyCode(e.target.value)} />
                            <button className="btn btn-primary btn-sm" onClick={async () => {
                                const res = await fetch('/api/user/verify-contact', { method: 'POST', body: JSON.stringify({ type: 'email', code: contactVerifyCode }) });
                                if (res.ok) {
                                    showToast('Email Verified!', 'success');
                                    setVerifyContactState({ type: null, step: 'idle' });
                                    setContactVerifyCode('');
                                    setUser(prev => prev ? { ...prev, emailVerified: true } : null);
                                } else { showToast('Invalid code', 'error'); }
                            }} style={{ fontSize: '12px', padding: '4px 8px' }}>Verify</button>
                        </div>
                    ) : (
                        <button className="btn btn-secondary btn-sm" disabled={isSaving} onClick={async () => {
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
                                const msg = err instanceof Error ? (err instanceof Error ? err.message : String(err)) : 'Error occurred';
                                showToast(msg, 'error');
                            } finally {
                                setIsSaving(false);
                            }
                        }} style={{ fontSize: '12px', padding: '6px 12px' }}>
                            Verify Email
                        </button>
                    )}
                </div>

                {/* Phone Verification */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px',
                    background: (user?.phoneVerified && user?.phone) ? 'rgba(16, 185, 129, 0.06)' : 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    border: (user?.phoneVerified && user?.phone) ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
                }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>📱 Phone Number</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            {user?.phoneVerified && user?.phone ? `+91-${user.phone}` : 'Required for campaign payout calls'}
                        </div>
                    </div>
                    {(user?.phoneVerified && user?.phone) ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                fontSize: '12px', fontWeight: 700, color: '#10b981',
                                background: 'rgba(16, 185, 129, 0.1)', padding: '5px 12px',
                                borderRadius: '20px',
                            }}>
                                ✅ Verified
                            </span>
                            <button className="btn btn-secondary btn-sm" disabled={isSaving} style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => handleStartContactChange('phone')}>{isSaving ? '...' : 'Change'}</button>
                        </div>
                    ) : verifyContactState.type === 'phone' && verifyContactState.step === 'code' ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="OTP" className="input" style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }} value={contactVerifyCode} onChange={(e) => setContactVerifyCode(e.target.value)} />
                            <button className="btn btn-primary btn-sm" onClick={async () => {
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
                            }} style={{ fontSize: '12px', padding: '4px 8px' }}>Verify</button>
                        </div>
                    ) : verifyContactState.type === 'phone' && verifyContactState.step === 'input' ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="e.g. 919876543210" className="input" style={{ width: '130px', padding: '4px 8px', fontSize: '12px' }} value={pendingContact} onChange={(e) => setPendingContact(e.target.value)} />
                            <button className="btn btn-primary btn-sm" disabled={isSaving} onClick={async () => {
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
                                        const msg = err instanceof Error ? (err instanceof Error ? err.message : String(err)) : 'Error occurred';
                                        showToast(msg, 'error');
                                    } finally {
                                        setIsSaving(false);
                                    }
                                }
                            }} style={{ fontSize: '12px', padding: '4px 8px' }}>
                                {isSaving ? '...' : 'Send OTP'}
                            </button>
                        </div>
                    ) : (
                        <button className="btn btn-secondary btn-sm" disabled={isSaving} onClick={() => {
                            setPendingContact('');
                            setVerifyContactState({ type: 'phone', step: 'input' });
                        }} style={{ fontSize: '12px', padding: '6px 12px' }}>
                            Add & Verify
                        </button>
                    )}
                </div>
            </div>

            {/* Change Contact Inline UI */}
            {changeContactState.active && (
                <div style={{
                    marginTop: '20px', padding: '16px', background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Change {changeContactState.type === 'email' ? 'Email Address' : 'Phone Number'}</h4>
                        <button style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }} onClick={() => setChangeContactState({ active: false, type: null, step: 'idle', currentEmailOtp: '', currentPhoneOtp: '', newContact: '', newOtp: '' })}>✕</button>
                    </div>

                    {changeContactState.step === 'verify-current' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>To protect your account, we've sent an OTP to your current contact method(s). Please enter the OTP to continue.</div>
                            {user?.email && (
                                <div>
                                    <label className="label">OTP from Email</label>
                                    <input type="text" className="input" placeholder="e.g. 123456" value={changeContactState.currentEmailOtp} onChange={e => setChangeContactState({ ...changeContactState, currentEmailOtp: e.target.value })} />
                                </div>
                            )}
                            {user?.phone && (
                                <div>
                                    <label className="label">OTP from Phone</label>
                                    <input type="text" className="input" placeholder="e.g. 123456" value={changeContactState.currentPhoneOtp} onChange={e => setChangeContactState({ ...changeContactState, currentPhoneOtp: e.target.value })} />
                                </div>
                            )}
                            <button className="btn btn-primary" onClick={handleVerifyCurrentContacts} disabled={isSaving}>Verify & Continue</button>
                        </div>
                    )}

                    {changeContactState.step === 'enter-new' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label className="label">Enter your new {changeContactState.type}</label>
                                <input type={changeContactState.type === 'email' ? 'email' : 'text'} className="input" placeholder={`New ${changeContactState.type}`} value={changeContactState.newContact} onChange={e => setChangeContactState({ ...changeContactState, newContact: e.target.value })} />
                            </div>
                            <button className="btn btn-primary" onClick={handleSendNewContactOtp} disabled={isSaving}>Send OTP to New {changeContactState.type}</button>
                        </div>
                    )}

                    {changeContactState.step === 'verify-new' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>We've sent an OTP to {changeContactState.newContact}.</div>
                            <div>
                                <label className="label">Enter OTP</label>
                                <input type="text" className="input" placeholder="e.g. 123456" value={changeContactState.newOtp} onChange={e => setChangeContactState({ ...changeContactState, newOtp: e.target.value })} />
                            </div>
                            <button className="btn btn-primary" onClick={handleConfirmNewContact} disabled={isSaving}>Confirm & Save</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

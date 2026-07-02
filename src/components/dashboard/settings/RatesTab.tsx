"use client";

import type { Profile } from "./ProfileTab";

interface RatesTabProps {
    profile: Profile;
    setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
}

export default function RatesTab({ profile, setProfile }: RatesTabProps) {
    return (
        <div className="card" style={{ maxWidth: "600px" }}>
            <h3
                style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    marginBottom: "20px",
                }}
            >
                Your Rate Card
            </h3>
            <p
                style={{
                    fontSize: "14px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "24px",
                }}
            >
                Set your expected rates for brand collaborations. This helps match
                you with the right campaigns.
            </p>

            <div
                className="grid-2"
                style={{ gap: "16px", marginBottom: "24px" }}
            >
                <div>
                    <label className="label">Minimum General Rate (₹)</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="10000"
                        // Display value in Rupees: convert database value (stored in Paise) by dividing by 100.
                        value={profile.minRate ? profile.minRate / 100 : ""}
                        onChange={(e) =>
                            setProfile({
                                ...profile,
                                // Save value in Paise: convert user input in Rupees by multiplying by 100.
                                minRate: parseInt(e.target.value) * 100 || 0,
                            })
                        }
                    />
                </div>
                <div>
                    <label className="label">Maximum General Rate (₹)</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="50000"
                        // Display value in Rupees: convert database value (stored in Paise) by dividing by 100.
                        value={profile.maxRate ? profile.maxRate / 100 : ""}
                        onChange={(e) =>
                            setProfile({
                                ...profile,
                                // Save value in Paise: convert user input in Rupees by multiplying by 100.
                                maxRate: parseInt(e.target.value) * 100 || 0,
                            })
                        }
                    />
                </div>
            </div>

            <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
                Instagram Collaboration Rates
            </h4>
            <div
                className="grid-2"
                style={{ gap: "16px", marginBottom: "24px" }}
            >
                <div>
                    <label className="label">Min Instagram Rate (₹)</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="2000"
                        value={profile.minInstagramRate ? profile.minInstagramRate / 100 : ""}
                        onChange={(e) =>
                            setProfile({
                                ...profile,
                                minInstagramRate: parseInt(e.target.value) * 100 || 0,
                            })
                        }
                    />
                </div>
                <div>
                    <label className="label">Max Instagram Rate (₹)</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="10000"
                        value={profile.maxInstagramRate ? profile.maxInstagramRate / 100 : ""}
                        onChange={(e) =>
                            setProfile({
                                ...profile,
                                maxInstagramRate: parseInt(e.target.value) * 100 || 0,
                            })
                        }
                    />
                </div>
            </div>

            <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
                YouTube Collaboration Rates
            </h4>
            <div
                className="grid-2"
                style={{ gap: "16px", marginBottom: "24px" }}
            >
                <div>
                    <label className="label">Min YouTube Rate (₹)</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="5000"
                        value={profile.minYoutubeRate ? profile.minYoutubeRate / 100 : ""}
                        onChange={(e) =>
                            setProfile({
                                ...profile,
                                minYoutubeRate: parseInt(e.target.value) * 100 || 0,
                            })
                        }
                    />
                </div>
                <div>
                    <label className="label">Max YouTube Rate (₹)</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="25000"
                        value={profile.maxYoutubeRate ? profile.maxYoutubeRate / 100 : ""}
                        onChange={(e) =>
                            setProfile({
                                ...profile,
                                maxYoutubeRate: parseInt(e.target.value) * 100 || 0,
                            })
                        }
                    />
                </div>
            </div>

            <div
                style={{
                    padding: "16px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "var(--radius-md)",
                }}
            >
                <p
                    style={{
                        fontSize: "14px",
                        color: "var(--color-text-secondary)",
                    }}
                >
                    💡 <strong>Tip:</strong> Based on your followers (
                    {((profile.instagramFollowers || 0) / 1000).toFixed(0)}K), similar
                    creators charge ₹8,000 - ₹35,000 per post/reel.
                </p>
            </div>
        </div>
    );
}

"use client";

import type { Profile } from "./ProfileTab";
import { Input } from "@/components/ui";

interface RatesTabProps {
    profile: Profile;
    setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
}

export default function RatesTab({ profile, setProfile }: Readonly<RatesTabProps>) {
    return (
        <div className="card max-w-600">
            <h3
                className="text-base font-bold mb-5"
            >
                Your Rate Card
            </h3>
            <p
                className="text-sm text-secondary mb-6"
            >
                Set your expected rates for brand collaborations. This helps match
                you with the right campaigns.
            </p>

            <div
                className="grid-2 gap-4 mb-6"
            >
                <Input
                    id="min-general-rate"
                    label="Minimum General Rate (₹)"
                    type="number"
                    placeholder="10000"
                    // Display value in Rupees: convert database value (stored in Paise) by dividing by 100.
                    value={profile.minRate ? profile.minRate / 100 : ""}
                    onChange={(e) =>
                        setProfile({
                            ...profile,
                            // Save value in Paise: convert user input in Rupees by multiplying by 100.
                            minRate: Number.parseInt(e.target.value, 10) * 100 || 0,
                        })
                    }
                    fullWidth
                />
                <Input
                    id="max-general-rate"
                    label="Maximum General Rate (₹)"
                    type="number"
                    placeholder="50000"
                    // Display value in Rupees: convert database value (stored in Paise) by dividing by 100.
                    value={profile.maxRate ? profile.maxRate / 100 : ""}
                    onChange={(e) =>
                        setProfile({
                            ...profile,
                            // Save value in Paise: convert user input in Rupees by multiplying by 100.
                            maxRate: Number.parseInt(e.target.value, 10) * 100 || 0,
                        })
                    }
                    fullWidth
                />
            </div>

            <h4 className="text-sm font-bold mb-3 border-top" style={{ paddingTop: "16px" }}>
                Instagram Collaboration Rates
            </h4>
            <div
                className="grid-2 gap-4 mb-6"
            >
                <Input
                    id="min-instagram-rate"
                    label="Min Instagram Rate (₹)"
                    type="number"
                    placeholder="2000"
                    value={profile.minInstagramRate ? profile.minInstagramRate / 100 : ""}
                    onChange={(e) =>
                        setProfile({
                            ...profile,
                            minInstagramRate: Number.parseInt(e.target.value, 10) * 100 || 0,
                        })
                    }
                    fullWidth
                />
                <Input
                    id="max-instagram-rate"
                    label="Max Instagram Rate (₹)"
                    type="number"
                    placeholder="10000"
                    value={profile.maxInstagramRate ? profile.maxInstagramRate / 100 : ""}
                    onChange={(e) =>
                        setProfile({
                            ...profile,
                            maxInstagramRate: Number.parseInt(e.target.value, 10) * 100 || 0,
                        })
                    }
                    fullWidth
                />
            </div>

            <h4 className="text-sm font-bold mb-3 border-top" style={{ paddingTop: "16px" }}>
                YouTube Collaboration Rates
            </h4>
            <div
                className="grid-2 gap-4 mb-6"
            >
                <Input
                    id="min-youtube-rate"
                    label="Min YouTube Rate (₹)"
                    type="number"
                    placeholder="5000"
                    value={profile.minYoutubeRate ? profile.minYoutubeRate / 100 : ""}
                    onChange={(e) =>
                        setProfile({
                            ...profile,
                            minYoutubeRate: Number.parseInt(e.target.value, 10) * 100 || 0,
                        })
                    }
                    fullWidth
                />
                <Input
                    id="max-youtube-rate"
                    label="Max YouTube Rate (₹)"
                    type="number"
                    placeholder="25000"
                    value={profile.maxYoutubeRate ? profile.maxYoutubeRate / 100 : ""}
                    onChange={(e) =>
                        setProfile({
                            ...profile,
                            maxYoutubeRate: Number.parseInt(e.target.value, 10) * 100 || 0,
                        })
                    }
                    fullWidth
                />
            </div>

            <div
                className="p-4 bg-tertiary rounded-md"
            >
                <p
                    className="text-sm text-secondary"
                >
                    💡 <strong>Tip:</strong> Based on your followers (
                    {((profile.instagramFollowers || 0) / 1000).toFixed(0)}K), similar
                    creators charge ₹8,000 - ₹35,000 per post/reel.
                </p>
            </div>
        </div>
    );
}

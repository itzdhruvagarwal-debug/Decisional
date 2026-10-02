import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing & Platform Fees — Free for Creators, 10% Escrow for Brands",
  description:
    "Explore VyaparMedia's transparent pricing: 100% free for creators with zero withdrawal or commission cuts. 10% milestone escrow fee for brands with automated Section 194-O TDS & GST compliance.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Transparent Creator & Brand Pricing | VyaparMedia",
    description:
      "No hidden fees. Free forever for creators. Automated milestone escrow, verified analytics, and legally binding smart contracts for brands.",
    url: "/pricing",
    type: "website",
  },
};

export default function PricingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

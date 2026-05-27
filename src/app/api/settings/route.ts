import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { z } from "zod";
import { logger } from "@/lib/logger";

const updateProfileSchema = z.object({
  displayName: z.string().optional().nullish(),
  bio: z.string().max(2000).optional().nullish(), // Increased to allow larger bios
  city: z.string().optional().nullish(),
  state: z.string().optional().nullish(),
  address: z.string().optional().nullish(),
  pinCode: z.string().optional().nullish(),
  gender: z.string().optional().nullish(),
  age: z.coerce.number().min(13).max(100).optional().nullish(),
  categories: z.array(z.string()).optional().nullish(),
  languages: z.array(z.string()).optional().nullish(),
  instagramHandle: z.string().optional().nullish(),
  youtubeHandle: z.string().optional().nullish(),
  minRate: z.coerce.number().min(0).optional().nullish().catch(0),
  maxRate: z.coerce.number().min(0).optional().nullish().catch(0),

  // Brand & Individual
  companyName: z.string().optional().nullish(),
  description: z.string().max(2000).optional().nullish(),
  website: z.string().optional().nullish(), // Allowed to not be a strict URL if they type something wrong
  industry: z.string().optional().nullish(),
  profileImage: z.string().optional().nullish(),
});

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        influencerProfile: true,
        brandProfile: true,
        badges: {
          include: { badge: true },
          orderBy: { earnedAt: "desc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Determine profile based on user type
    let profileData: any = {};
    const userType = session.user.userType;

    if (userType === "INFLUENCER") {
      profileData = user.influencerProfile || {};
    } else if (userType === "BRAND") {
      profileData = user.brandProfile || {};
    }

    return NextResponse.json({
      user: {
        // name: user.name, // Removed as it doesn't exist
        email: user.email,
        phone: (user as any).phoneNumber || (user as any).phone || null,
        emailVerified: !!(user as any).emailVerified,
        phoneVerified: !!(user as any).phoneVerified,
        isTwoFactorEnabled: !!(user as any).isTwoFactorEnabled,
        userType: userType, // Added userType
        referralCode: user.referralCode,
        trustScore: user.trustScore,
        level: user.level,
        verificationLevel: user.verificationLevel,
        notificationPreferences: (user as any).notificationPreferences || {
          email: { marketing: true, updates: true, security: true },
          push: { marketing: true, updates: true, security: true },
        },
        lastLogin: (user as any).lastLogin,
      },
      profile: {
        // Common fields
        displayName:
          profileData.displayName ||
          profileData.companyName ||
          user.email.split("@")[0] ||
          "",
        bio: profileData.bio || profileData.description || "",
        city: profileData.city || "",
        state: profileData.state || "",
        address: profileData.address || "",
        pinCode: profileData.pinCode || "",
        gender: profileData.gender || "",
        age: profileData.age || null,

        // Influencer specific
        categories: profileData.categories
          ? profileData.categories.split(",")
          : [],
        languages: profileData.languages
          ? profileData.languages.split(",")
          : [],
        instagramHandle: profileData.instagramHandle || "",
        instagramFollowers: profileData.instagramFollowers || 0,
        instagramEngagementRate: profileData.instagramEngagementRate || 0,
        youtubeHandle: profileData.youtubeHandle || "",
        youtubeSubscribers: profileData.youtubeSubscribers || 0,
        minRate: profileData.minRate || 0,
        maxRate: profileData.maxRate || 0,

        // Brand specific
        companyName: profileData.companyName || "",
        website: profileData.website || "",
        industry: profileData.industry || "",

        // Individual specific
        // (Mostly covers common fields)

        profileImage: profileData.avatar || profileData.logo || "",
      },
      badges: user.badges.map((ub: any) => ({
        ...ub.badge,
        earnedAt: ub.earnedAt,
      })),
    });
  } catch (error: unknown) {
    logger.error("Settings fetch error", error);
    return NextResponse.json(
      { error: "Failed to load settings. Please try again." },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Handle notification preferences separately since it's on User model
    if (body.notificationPreferences) {
      await (prisma.user as any).update({
        where: { id: session.user.id },
        data: { notificationPreferences: body.notificationPreferences },
      });
      // If only updating preferences, return early
      if (Object.keys(body).length === 1) {
        return NextResponse.json({
          success: true,
          message: "Notification preferences updated",
        });
      }
    }

    const result = updateProfileSchema.safeParse(body);

    if (!result.success) {
      // If we have valid notificationPreferences but invalid profile data (and profile data was sent), we might want to warn or error.
      // But if ONLY notificationPreferences was sent, we already handled it above.
      // If mixed, we proceed to profile update if schema allows partials (which it does with .optional())
      // But safeParse will fail if unknown keys are strict, but here it's z.object({...}) which strips unknown keys by default?
      // Actually zod strips unknown keys by default unless .strict() is used.
      // Our schema handles profile fields.

      // If we are here, it means we have profile fields that are invalid.
      logger.warn("Settings validation error", {
        details: result.error.format(),
      });
      return NextResponse.json(
        { error: "Invalid input", details: result.error.format() },
        { status: 400 },
      );
    }

    const data = result.data;
    const userId = session.user.id;

    // Determine profile type update
    if (session.user.userType === "INFLUENCER") {
      const updateData: any = {};
      if (data.displayName !== undefined)
        updateData.displayName = data.displayName;
      if (data.bio !== undefined) updateData.bio = data.bio;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.state !== undefined) updateData.state = data.state;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.pinCode !== undefined) updateData.pinCode = data.pinCode;
      if (data.gender !== undefined) updateData.gender = data.gender;
      if (data.age !== undefined) updateData.age = data.age;
      if (data.categories != null)
        updateData.categories = data.categories.join(",");
      if (data.languages != null)
        updateData.languages = data.languages.join(",");
      if (data.instagramHandle !== undefined)
        updateData.instagramHandle = data.instagramHandle;
      if (data.youtubeHandle !== undefined)
        updateData.youtubeHandle = data.youtubeHandle;
      if (data.minRate !== undefined) updateData.minRate = data.minRate;
      if (data.maxRate !== undefined) updateData.maxRate = data.maxRate;
      if (data.profileImage !== undefined)
        updateData.avatar = data.profileImage;

      await prisma.influencerProfile.upsert({
        where: { userId },
        create: {
          userId,
          displayName:
            data.displayName ||
            (session.user.email ? session.user.email.split("@")[0] : "") ||
            "",
          categories: data.categories ? data.categories.join(",") : "General",
          languages: data.languages ? data.languages.join(",") : "English",
          ...updateData,
        },
        update: updateData,
      });
    } else if (session.user.userType === "BRAND") {
      const updateData: any = {};
      // Map displayName to companyName if present (since frontend uses generic displayName)
      if (data.displayName !== undefined && data.displayName !== null) {
        updateData.companyName = data.displayName;
      } else if (data.companyName !== undefined && data.companyName !== null) {
        updateData.companyName = data.companyName;
      }
      if (data.bio !== undefined) updateData.description = data.bio;
      if (data.website !== undefined) updateData.website = data.website;
      if (data.industry !== undefined) updateData.industry = data.industry;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.state !== undefined) updateData.state = data.state;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.pinCode !== undefined) updateData.pinCode = data.pinCode;
      if (data.profileImage !== undefined) updateData.logo = data.profileImage;

      await prisma.brandProfile.upsert({
        where: { userId },
        create: {
          userId,
          companyName:
            updateData.companyName ||
            data.companyName ||
            (session.user.email ? session.user.email.split("@")[0] : "") ||
            "",
          ...updateData,
        },
        update: updateData,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    logger.error("Settings update error", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

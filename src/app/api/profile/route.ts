import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { UserService } from "@/services/user.service";
import { influencerProfileSchema, brandProfileSchema } from "@/lib/validations";

export const GET = apiWrapper(async (_req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await UserService.getProfile(session.user.id);
  return NextResponse.json({ user });
});

export const PUT = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const userType = session.user.userType;
  let validData;

  try {
    if (userType === "INFLUENCER") {
      validData = influencerProfileSchema.parse(body);
    } else if (userType === "BRAND") {
      validData = brandProfileSchema.parse(body);
    } else {
      return NextResponse.json({ error: "Invalid user type" }, { status: 400 });
    }
  } catch (error: any) {
    // Zod error
    return NextResponse.json(
      { error: "Validation failed", details: error.flatten() },
      { status: 400 },
    );
  }

  const updatedProfile = await UserService.updateProfile(
    session.user.id,
    userType,
    validData,
  );

  return NextResponse.json({
    success: true,
    message: "Profile updated successfully",
    profile: updatedProfile,
  });
});

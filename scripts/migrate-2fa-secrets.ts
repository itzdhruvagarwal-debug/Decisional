import prisma from "../src/lib/db";
import { encrypt } from "../src/lib/encryption";
import { logger } from "../src/lib/logger";

async function migrate() {
  const users = await prisma.user.findMany({
    where: {
      twoFactorSecret: {
        not: null,
      },
    },
    select: {
      id: true,
      twoFactorSecret: true,
    },
  });

  let migratedCount = 0;
  for (const user of users) {
    const secret = user.twoFactorSecret;
    if (secret && !secret.includes(":")) {
      // It is plaintext! Encrypt it
      const encrypted = encrypt(secret);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorSecret: encrypted,
        },
      });
      migratedCount++;
    }
  }

  logger.info(`Successfully migrated ${migratedCount} plaintext 2FA secrets to encrypted format.`);
}

migrate()
  .catch((err) => {
    logger.error("2FA secrets migration failed", err);
  })
  .finally(() => {
    process.exit(0);
  });

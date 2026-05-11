import IORedis from "ioredis";
import { randomBytes } from "crypto";
import { prisma } from "@endgit/database";
import { generateToken } from "../../middleware/auth";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    family: 4,
    tls: REDIS_URL.startsWith("rediss://")
        ? { rejectUnauthorized: false }
        : undefined,
});

const REFRESH_TTL = 30 * 24 * 3600; // 30 days

interface RefreshEntry {
    userId: string;
    username: string;
    trustLevel: string;
}

export class RefreshService {
    async createRefreshToken(
        userId: string,
        username: string,
        trustLevel: string,
    ): Promise<string> {
        const token = randomBytes(32).toString("hex");
        const entry: RefreshEntry = { userId, username, trustLevel };
        await redis.setex(
            `refresh:${token}`,
            REFRESH_TTL,
            JSON.stringify(entry),
        );
        return token;
    }

    async rotateRefreshToken(
        oldToken: string,
    ): Promise<{
        access_token: string;
        refresh_token: string;
        username: string;
    } | null> {
        const key = `refresh:${oldToken}`;
        const raw = await redis.get(key);
        if (!raw) return null;

        const { userId } = JSON.parse(raw) as RefreshEntry;

        await redis.del(key);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, trustLevel: true },
        });
        if (!user) return null;

        const access_token = generateToken({
            id: user.id,
            username: user.username,
            trustLevel: user.trustLevel,
        });
        const refresh_token = await this.createRefreshToken(
            user.id,
            user.username,
            user.trustLevel,
        );

        return { access_token, refresh_token, username: user.username };
    }

    async revokeRefreshToken(token: string): Promise<void> {
        await redis.del(`refresh:${token}`);
    }
}

export const refreshService = new RefreshService();

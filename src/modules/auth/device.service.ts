import IORedis from "ioredis";
import { randomBytes } from "crypto";
import { prisma } from "@endgit/database";
import { generateToken } from "../../middleware/auth";
import { refreshService } from "./refresh.service";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    family: 4,
    tls: REDIS_URL.startsWith("rediss://")
        ? { rejectUnauthorized: false }
        : undefined,
});

const DEVICE_CODE_TTL = 900; // 15 minutes
const POLL_INTERVAL = 5; // seconds

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateDeviceCode(): string {
    return randomBytes(20).toString("hex");
}

function generateUserCode(): string {
    let code = "";
    const bytes = randomBytes(8);
    for (let i = 0; i < 8; i++) {
        code += CHARSET[bytes[i] % CHARSET.length];
    }
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

interface DeviceEntry {
    user_code: string;
    status: "pending" | "authorized" | "denied";
    userId?: string;
    expires_at: number;
}

export class DeviceService {
    async createDeviceCode() {
        const deviceCode = generateDeviceCode();
        const userCode = generateUserCode();
        const expiresAt = Math.floor(Date.now() / 1000) + DEVICE_CODE_TTL;

        const siteUrl = process.env.SITE_URL || "https://endgit.dev";

        const entry: DeviceEntry = {
            user_code: userCode,
            status: "pending",
            expires_at: expiresAt,
        };

        await Promise.all([
            redis.setex(
                `device:dc:${deviceCode}`,
                DEVICE_CODE_TTL,
                JSON.stringify(entry),
            ),
            redis.setex(`device:uc:${userCode}`, DEVICE_CODE_TTL, deviceCode),
        ]);

        return {
            device_code: deviceCode,
            user_code: userCode,
            verification_uri: `${siteUrl}/oauth/device`,
            expires_in: DEVICE_CODE_TTL,
            interval: POLL_INTERVAL,
        };
    }

    async authorizeDevice(userCode: string, userId: string) {
        const normalized = userCode.toUpperCase().replace(/\s/g, "");
        const deviceCode = await redis.get(`device:uc:${normalized}`);

        if (!deviceCode) {
            throw new Error("Invalid or expired user code");
        }

        const raw = await redis.get(`device:dc:${deviceCode}`);
        if (!raw) {
            throw new Error("Device code has expired");
        }

        const entry: DeviceEntry = JSON.parse(raw);

        if (entry.status !== "pending") {
            throw new Error("This device code has already been used");
        }

        entry.status = "authorized";
        entry.userId = userId;

        const ttlRemaining = await redis.ttl(`device:dc:${deviceCode}`);
        if (ttlRemaining > 0) {
            await redis.setex(
                `device:dc:${deviceCode}`,
                ttlRemaining,
                JSON.stringify(entry),
            );
        }
    }

    async pollDeviceToken(deviceCode: string) {
        const raw = await redis.get(`device:dc:${deviceCode}`);

        if (!raw) {
            return { error: "expired_token" as const };
        }

        const entry: DeviceEntry = JSON.parse(raw);

        if (entry.status === "pending") {
            return { error: "authorization_pending" as const };
        }

        if (entry.status === "denied") {
            // Clean up immediately
            await redis.del(
                `device:dc:${deviceCode}`,
                `device:uc:${entry.user_code}`,
            );
            return { error: "access_denied" as const };
        }

        const user = await prisma.user.findUnique({
            where: { id: entry.userId },
            select: { id: true, username: true, trustLevel: true },
        });

        if (!user) {
            return { error: "expired_token" as const };
        }

        await redis.del(
            `device:dc:${deviceCode}`,
            `device:uc:${entry.user_code}`,
        );

        const token = generateToken({
            id: user.id,
            username: user.username,
            trustLevel: user.trustLevel,
        });

        const refreshToken = await refreshService.createRefreshToken(
            user.id,
            user.username,
            user.trustLevel,
        );

        return {
            access_token: token,
            refresh_token: refreshToken,
            token_type: "bearer",
            username: user.username,
        };
    }
}

export const deviceService = new DeviceService();

import { prisma } from "@endgit/database";
import { generateToken } from "../../middleware/auth";
import { refreshService } from "./refresh.service";

export class AuthService {
    async authenticateWithGitHub(
        accessToken: string,
        tokenType?: string,
        scope?: string,
    ) {
        if (!accessToken) throw new Error("GitHub access token is required");

        const userResponse = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!userResponse.ok)
            throw new Error("Failed to fetch user from GitHub");

        const githubUser: any = await userResponse.json();

        const user = await prisma.user.upsert({
            where: { githubId: String(githubUser.id) },
            update: {
                username: githubUser.login,
                displayName: githubUser.name,
                email: githubUser.email,
                avatarUrl: githubUser.avatar_url,
                bio: githubUser.bio,
            },
            create: {
                githubId: String(githubUser.id),
                username: githubUser.login,
                displayName: githubUser.name,
                email: githubUser.email,
                avatarUrl: githubUser.avatar_url,
                bio: githubUser.bio,
            },
        });

        await prisma.account.upsert({
            where: {
                provider_providerAccountId: {
                    provider: "github",
                    providerAccountId: String(githubUser.id),
                },
            },
            update: {
                access_token: accessToken,
                token_type: tokenType || "bearer",
                scope: scope || "",
            },
            create: {
                userId: user.id,
                type: "oauth",
                provider: "github",
                providerAccountId: String(githubUser.id),
                access_token: accessToken,
                token_type: tokenType || "bearer",
                scope: scope || "",
            },
        });

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
            token,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                trustLevel: user.trustLevel,
            },
        };
    }

    async getCurrentUser(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                displayName: true,
                email: true,
                avatarUrl: true,
                bio: true,
                trustLevel: true,
                createdAt: true,
            },
        });

        if (!user) throw new Error("User not found");
        return user;
    }
}

export const authService = new AuthService();

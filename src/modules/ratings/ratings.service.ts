import { prisma } from "@endgit/database";
import { sendNewRatingWebhook } from "../../utils/discord";

export class RatingsService {
  async getRatings(slug: string, page: number, limit: number) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    const skip = (page - 1) * limit;

    const [ratings, total] = await Promise.all([
      prisma.rating.findMany({
        where: { pluginId: plugin.id },
        skip, take: limit, orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, trustLevel: true } } }
      }),
      prisma.rating.count({ where: { pluginId: plugin.id } })
    ]);

    return { ratings, total, totalPages: Math.ceil(total / limit) };
  }

  async getRatingSummary(slug: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    const ratings = await prisma.rating.findMany({
      where: { pluginId: plugin.id },
      select: { score: true }
    });

    const total = ratings.length;
    const avg = total > 0 ? ratings.reduce((sum, r) => sum + r.score, 0) / total : 0;
    const distribution = [1, 2, 3, 4, 5].map(star => ({
      star,
      count: ratings.filter(r => r.score === star).length,
      percentage: total > 0 ? Math.round((ratings.filter(r => r.score === star).length / total) * 100) : 0
    }));

    return { average: Math.round(avg * 10) / 10, total, distribution };
  }

  async submitRating(slug: string, userId: string, score: number, comment?: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    if (!score || score < 1 || score > 5) throw new Error("Score must be between 1 and 5");

    const existingRating = await prisma.rating.findUnique({
      where: { userId_pluginId: { userId, pluginId: plugin.id } }
    });

    const rating = await prisma.rating.upsert({
      where: { userId_pluginId: { userId, pluginId: plugin.id } },
      create: { score, comment: comment || null, userId, pluginId: plugin.id },
      update: { score, comment: comment || null },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, trustLevel: true } } }
    });

    const avgResult = await prisma.rating.aggregate({
      where: { pluginId: plugin.id },
      _avg: { score: true },
      _count: true
    });
    
    await prisma.plugin.update({
      where: { id: plugin.id },
      data: { stars: Math.round((avgResult._avg.score || 0) * 20) }
    });

    // Only send webhook if it's a new rating, not an update
    if (!existingRating && rating.user?.username) {
      await sendNewRatingWebhook(plugin, rating, rating.user.username);
    }

    return rating;
  }

  async deleteRating(slug: string, userId: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    await prisma.rating.deleteMany({
      where: { userId, pluginId: plugin.id }
    });
  }

  async replyToRating(slug: string, ratingId: string, reply: string, userId: string) {
    throw new Error("Replying to ratings is currently not supported in the database schema");
  }
}

export const ratingsService = new RatingsService();

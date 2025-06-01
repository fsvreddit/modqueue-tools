import { Comment, JobContext, Post, TriggerContext } from "@devvit/public-api";
import { AppInstall, AppUpgrade } from "@devvit/protos";
import { getSubredditName } from "./utility.js";
import { QueuedItemProperties } from "./handleActions.js";
import { FILTERED_ITEM_KEY } from "./redisHelper.js";
import { addSeconds } from "date-fns";

export async function onAppInstallOrUpgrade (_: AppInstall | AppUpgrade, context: TriggerContext) {
    const currentJobs = await context.scheduler.listJobs();
    await Promise.all(currentJobs.map(job => context.scheduler.cancelJob(job.id)));

    const randomMinute = Math.floor(Math.random() * 5);
    await context.scheduler.runJob({
        name: "analyseQueue",
        cron: `${randomMinute}/5 * * * *`,
    });

    await context.scheduler.runJob({
        name: "buildAnalytics",
        cron: "1 0 * * *",
    });

    await context.scheduler.runJob({
        name: "aggregateStorage",
        cron: "0 5 * * *",
    });

    await context.scheduler.runJob({
        name: "buildAnalytics",
        runAt: addSeconds(new Date(), 5),
    });
}

/**
 * Prepopulates the filtered item set with posts and comments thathave been filtered
 * by Automod or Reddit. This means that initial alerts and mod actions have a much
 * more accurate item ages.
 */
export async function onAppInstall (event: AppInstall, context: TriggerContext) {
    await onAppInstallOrUpgrade(event, context);

    await context.scheduler.runJob({
        name: "onInstall",
        runAt: new Date(),
    });
}

export async function onAppInstallJobHandler (_: unknown, context: JobContext) {
    const modqueue = await context.reddit.getModQueue({
        subreddit: await getSubredditName(context),
        type: "all",
        limit: 1000,
    }).all();

    // Filter down to posts or comments that are filtered
    const queuedPosts = modqueue.filter(item => item instanceof Post && (item.removedBy ?? item.removedByCategory)) as Post[];
    const queuedComments = modqueue.filter(item => item instanceof Comment && item.numReports === 0) as Comment[];

    const filteredItems = [
        ...queuedPosts.map(item => ({ itemId: item.id, postId: item.id, reasonForQueue: "AutoModerator", queueDate: item.createdAt.getTime() } as QueuedItemProperties)),
        ...queuedComments.map(item => ({ itemId: item.id, postId: item.postId, reasonForQueue: "AutoModerator", queueDate: item.createdAt.getTime() } as QueuedItemProperties)),
    ];

    for (const item of filteredItems) {
        await context.redis.hSet(FILTERED_ITEM_KEY, { [item.itemId]: JSON.stringify(item) });
    }
}

import { ScheduledJobEvent, TriggerContext } from "@devvit/public-api";
import { QueuedItemProperties } from "./handleActions.js";
import { compact } from "lodash";
import { FILTERED_ITEM_KEY, recordQueueLength } from "./redisHelper.js";
import { checkAlerting } from "./alerting.js";
import { refreshWikiPage } from "./analyticsWikiPage.js";
import { aggregateOlderData } from "./aggregator.js";
import { ScheduledJob } from "./constants.js";

export type AnalyseQueueJobData = {
    source: "cron" | "extra";
};

export async function analyseQueue (event: ScheduledJobEvent<AnalyseQueueJobData>, context: TriggerContext) {
    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();

    // Get current mod queue
    const modQueue = await context.reddit.getModQueue({
        subreddit: subredditName,
        type: "all",
        limit: 1000,
    }).all();

    console.log(`Queue length: ${modQueue.length}`);
    if (event.data.source === "cron") {
        await recordQueueLength(modQueue.length, context);
    }

    // Get record of previously queued items
    const potentiallyQueuedItems = await context.redis.hGetAll(FILTERED_ITEM_KEY);

    console.log(`Potential Queued Store length: ${Object.keys(potentiallyQueuedItems).length}`);

    // Identify any keys that were potentially queued but are not currently in modqueue.
    const keysNotInQueue = Object.keys(potentiallyQueuedItems).filter(key => !modQueue.some(queueItem => queueItem.id === key));
    if (keysNotInQueue.length > 0) {
        // Remove from Redis set
        const itemsRemoved = await context.redis.hDel(FILTERED_ITEM_KEY, keysNotInQueue);
        console.log(`${itemsRemoved} items removed from Redis set.`);
    }

    const queueItemProps = compact(modQueue.map(queueItem => potentiallyQueuedItems[queueItem.id])).map(item => JSON.parse(item) as QueuedItemProperties);

    await checkAlerting(modQueue, queueItemProps, event.data.source, context);
}

export async function buildAnalytics (_: unknown, context: TriggerContext) {
    await refreshWikiPage(context);
}

export async function aggregateStorage (_: unknown, context: TriggerContext) {
    await aggregateOlderData(context);
}

const CRON_MINUTE_KEY = "CronMinute";

export async function recordCronMinute (minute: number, context: TriggerContext) {
    await context.redis.set(CRON_MINUTE_KEY, minute.toString());
}

async function getExtraJobs (context: TriggerContext) {
    const jobs = await context.scheduler.listJobs();
    return jobs.filter(job => job.name === ScheduledJob.AnalyseQueue as string && "cron" in job && job.data?.source === "extra");
}

export async function scheduleExtraJobs (context: TriggerContext) {
    const extraJobs = await getExtraJobs(context);
    if (extraJobs.length > 0) {
        console.error("Extra Jobs: Already scheduled");
        return;
    }

    const cronMinuteValue = await context.redis.get(CRON_MINUTE_KEY);
    if (!cronMinuteValue) {
        return;
    }

    const cronMinute = parseInt(cronMinuteValue, 10);

    const extraCronMinutes = [0, 1, 2, 3, 4].filter(minute => minute !== cronMinute);

    await Promise.all(extraCronMinutes.map(minute => context.scheduler.runJob<AnalyseQueueJobData>({
        name: ScheduledJob.AnalyseQueue,
        cron: `${minute}/5 * * * *`,
        data: {
            source: "extra",
        },
    })));
}

export async function cancelExtraJobs (context: TriggerContext) {
    const extraJobs = await getExtraJobs(context);
    await Promise.all(extraJobs.map(job => context.scheduler.cancelJob(job.id)));
}

import { JSONObject, ScheduledJobEvent, TriggerContext } from "@devvit/public-api";
import { getSubredditName } from "./utility.js";
import { QueuedItemProperties } from "./handleActions.js";
import { compact } from "lodash";
import { FILTERED_ITEM_KEY, recordQueueLength } from "./redisHelper.js";
import { checkAlerting } from "./alerting.js";
import { refreshWikiPage } from "./analyticsWikiPage.js";
import { aggregateOlderData } from "./aggregator.js";

export async function analyseQueue (_event: ScheduledJobEvent<JSONObject | undefined>, context: TriggerContext) {
    const subredditName = await getSubredditName(context);

    // Get current mod queue
    const modQueue = await context.reddit.getModQueue({
        subreddit: subredditName,
        type: "all",
        limit: 1000,
    }).all();

    console.log(`Queue length: ${modQueue.length}`);
    await recordQueueLength(modQueue.length, context);

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

    if (modQueue.length > 0) {
        await checkAlerting(modQueue, queueItemProps, context);
    }
}

export async function buildAnalytics (_: ScheduledJobEvent<JSONObject | undefined>, context: TriggerContext) {
    await refreshWikiPage(context);
}

export async function aggregateStorage (_: ScheduledJobEvent<JSONObject | undefined>, context: TriggerContext) {
    await aggregateOlderData(context);
}

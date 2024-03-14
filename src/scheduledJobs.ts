import {ScheduledJobEvent, TriggerContext} from "@devvit/public-api";
import {getSubredditName} from "./utility.js";
import {QueuedItemProperties} from "./handleActions.js";
import _ from "lodash";
import {FILTERED_ITEM_KEY, recordQueueLength} from "./redisHelper.js";
import {checkAlerting} from "./alerting.js";

export async function analyseQueue (_event: ScheduledJobEvent, context: TriggerContext) {
    const subredditName = await getSubredditName(context);

    // Get current modqueue
    const modQueue = await context.reddit.getModQueue({
        subreddit: subredditName,
        type: "all",
        limit: 1000,
    }).all();

    console.log(`Queue length: ${modQueue.length}`);
    await recordQueueLength(modQueue.length, context);

    let queueAges: Date[] | undefined;

    // Get record of previously queued items.
    const potentiallyQueuedItems = await context.redis.hgetall(FILTERED_ITEM_KEY);
    if (potentiallyQueuedItems) {
        console.log(`Potential Queued Store length: ${Object.keys(potentiallyQueuedItems).length}`);

        // Identify any keys that were potentially queued but are not currently in modqueue.
        const keysNotInQueue = Object.keys(potentiallyQueuedItems).filter(key => !modQueue.some(queueItem => queueItem.id === key));
        if (keysNotInQueue.length > 0) {
            // Remove from Redis set
            const itemsRemoved = await context.redis.hdel(FILTERED_ITEM_KEY, keysNotInQueue);
            console.log(`${itemsRemoved} items removed from Redis set.`);
        }

        const queueItemProps = _.compact(modQueue.map(queueItem => potentiallyQueuedItems[queueItem.id])).map(item => JSON.parse(item) as QueuedItemProperties);
        if (queueItemProps.length > 0) {
            queueAges = queueItemProps.map(x => new Date(x.queueDate));
        }
    }

    await checkAlerting(modQueue, queueAges, context);
}

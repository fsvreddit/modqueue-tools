import {TriggerContext} from "@devvit/public-api";

export const FILTERED_ITEM_KEY = "FilteredItemKey";
export const ACTION_DELAY_KEY = "ActionDelayKey";
export const QUEUE_LENGTH_KEY = "QueueLengthKey";

export async function recordActionDelay (itemId: string, delayInSeconds: number, context: TriggerContext) {
    const member = `${new Date().getTime()}~${itemId}~${delayInSeconds}`;
    await context.redis.zAdd(ACTION_DELAY_KEY, {member, score: new Date().getTime()});
}

export async function recordQueueLength (queueLength: number, context: TriggerContext) {
    const now = new Date().getTime();
    await context.redis.zAdd(QUEUE_LENGTH_KEY, {member: `${now}~${queueLength}`, score: now});
}

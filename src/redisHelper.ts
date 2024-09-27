import {TriggerContext} from "@devvit/public-api";

export const FILTERED_ITEM_KEY = "FilteredItemKey";
export const ACTION_DELAY_KEY = "ActionDelayKey";
export const ACTION_DELAY_KEY_HOURLY = "ActionDelayKeyHourly";
export const QUEUE_LENGTH_KEY = "QueueLengthKey";
export const QUEUE_LENGTH_KEY_HOURLY = "QueueLengthKeyHourly";

export async function recordActionDelay (date: Date, itemId: string, delayInSeconds: number, context: TriggerContext) {
    const member = `${date.getTime()}~${itemId}~${delayInSeconds}`;
    await context.redis.zAdd(ACTION_DELAY_KEY, {member, score: date.getTime()});
}

export async function recordQueueLength (queueLength: number, context: TriggerContext) {
    const now = new Date().getTime();
    await context.redis.zAdd(QUEUE_LENGTH_KEY, {member: `${now}~${queueLength}`, score: now});
}

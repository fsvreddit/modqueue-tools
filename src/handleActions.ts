import {TriggerContext} from "@devvit/public-api";
import {ModAction, PostReport, CommentReport} from "@devvit/protos";
import {differenceInSeconds, subSeconds} from "date-fns";
import {FILTERED_ITEM_KEY, recordActionDelay} from "./redisHelper.js";
import {formatDurationToNow} from "./utility.js";

export interface QueuedItemProperties {
    postId: string,
    itemId: string,
    reasonForQueue: "AutoModerator" | "reddit" | "report",
    queueDate: number,
}

function getItemIdFromModAction (event: ModAction): string {
    if (event.targetComment && event.targetComment.id) {
        return event.targetComment.id;
    } else if (event.targetPost && event.targetPost.id) {
        return event.targetPost.id;
    } else {
        throw new Error("Unexpected mod action type");
    }
}

function getPostIdFromModAction (event: ModAction): string {
    if (event.targetComment && event.targetComment.id) {
        return event.targetComment.postId;
    } else if (event.targetPost && event.targetPost.id) {
        return event.targetPost.id;
    } else {
        throw new Error("Unexpected mod action type");
    }
}

export async function handleModAction (event: ModAction, context: TriggerContext) {
    if (!event.action || !event.moderator || !event.actionedAt) {
        return;
    }

    if (event.action === "approvelink" || event.action === "approvecomment") {
        const itemId = getItemIdFromModAction(event);
        const existingValue = await context.redis.hget(FILTERED_ITEM_KEY, itemId);
        if (existingValue) {
            const queueItemProps = JSON.parse(existingValue) as QueuedItemProperties;
            const secondsBeforeAction = differenceInSeconds(event.actionedAt, queueItemProps.queueDate);
            console.log(`${itemId}: Approved by ${event.moderator.name}. Item actioned after ${formatDurationToNow(subSeconds(new Date(), secondsBeforeAction))}`);
            await recordActionDelay(event.actionedAt, itemId, secondsBeforeAction, context);
            await context.redis.hdel(FILTERED_ITEM_KEY, [itemId]);
        } else {
            console.log(`${itemId}: Approved by ${event.moderator.name}, but item doesn't appear to have been in the queue.`);
        }
    }

    if (event.action === "removelink" || event.action === "removecomment" || event.action === "spamlink" || event.action === "spamcomment") {
        const itemId = getItemIdFromModAction(event);
        const postId = getPostIdFromModAction(event);

        if (event.moderator.name === "AutoModerator" || event.moderator.name === "reddit") {
            // Action that might result in a modqueue item, so store in hash.
            // Check to see if item has already been potentially queued.
            const existingValue = await context.redis.hget(FILTERED_ITEM_KEY, itemId);
            if (!existingValue) {
                const props: QueuedItemProperties = {
                    postId,
                    itemId,
                    reasonForQueue: event.moderator.name,
                    queueDate: event.actionedAt.getTime(),
                };
                await context.redis.hset(FILTERED_ITEM_KEY, {[itemId]: JSON.stringify(props)});
                console.log(`${itemId}: Removed by ${event.moderator.name} so may be queued. Added to Redis.`);
            }
        } else {
            // Human mod, AEO or other definitive removal action, item cannot be in queue after.
            const existingValue = await context.redis.hget(FILTERED_ITEM_KEY, itemId);
            if (existingValue) {
                const queueItemProps = JSON.parse(existingValue) as QueuedItemProperties;
                const secondsBeforeAction = differenceInSeconds(event.actionedAt, queueItemProps.queueDate);
                console.log(`${itemId}: Removed by ${event.moderator.name}. Item actioned after ${formatDurationToNow(subSeconds(new Date(), secondsBeforeAction))}`);
                await recordActionDelay(event.actionedAt, itemId, secondsBeforeAction, context);
                await context.redis.hdel(FILTERED_ITEM_KEY, [itemId]);
            } else {
                console.log(`${itemId}: Removed by ${event.moderator.name}, but item doesn't appear to have been in the queue.`);
            }
        }
    }
}

async function handleReport (itemId: string, postId: string, context: TriggerContext) {
    const existingValue = await context.redis.hget(FILTERED_ITEM_KEY, itemId);
    if (!existingValue) {
        const props: QueuedItemProperties = {
            postId,
            itemId,
            reasonForQueue: "report",
            queueDate: new Date().getTime(),
        };
        await context.redis.hset(FILTERED_ITEM_KEY, {[itemId]: JSON.stringify(props)});
        console.log(`${itemId}: Reported. Added to Redis store.`);
    } else {
        console.log(`${itemId}: Reported, but was already in Redis store.`);
    }
}

export async function handlePostReport (event: PostReport, context: TriggerContext) {
    if (!event.post) {
        return;
    }
    await handleReport(event.post.id, event.post.id, context);
}

export async function handleCommentReport (event: CommentReport, context: TriggerContext) {
    if (!event.comment) {
        return;
    }
    await handleReport(event.comment.id, event.comment.postId, context);
}

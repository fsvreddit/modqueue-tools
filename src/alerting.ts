import {Comment, Post, TriggerContext} from "@devvit/public-api";
import {AppSetting} from "./settings.js";
import {addDays, subHours} from "date-fns";
import {ThingPrefix, formatDurationToNow, getSubredditName} from "./utility.js";
import pluralize from "pluralize";
import {QueuedItemProperties} from "./handleActions.js";
import markdownEscape from "markdown-escape";
import _ from "lodash";

interface QueuedPostCount {
    postId: string,
    count: number,
}

function getTopPosts (modQueue: (Post | Comment)[], threshold: number): QueuedPostCount[] {
    const postIdList = modQueue.map(item => item instanceof Comment ? item.postId : item.id);
    const countedPosts = _.countBy(postIdList);
    const postsInQueue = Object.keys(countedPosts).map(postId => <QueuedPostCount>{postId, count: countedPosts[postId]});

    return postsInQueue.filter(item => Math.round(100 * item.count / modQueue.length) >= threshold).sort((a, b) => b.count - a.count);
}

export async function checkAlerting (modQueue: (Post | Comment)[], queueItemProps: QueuedItemProperties[], context: TriggerContext) {
    const settings = await context.settings.getAll();
    if (!settings[AppSetting.EnableAlerts]) {
        console.log("Alerting: Alerting is disabled.");
        return;
    }

    const discordWebhookUrl = settings[AppSetting.DiscordWebhook] as string;
    if (!discordWebhookUrl) {
        console.log("Alerting: Webhook is not set up!");
        return;
    }

    let shouldAlert = false;
    const alertThreshold = settings[AppSetting.AlertThreshold] as number;
    const alertAgeHours = settings[AppSetting.AlertAgeHours] as number;

    if (alertThreshold && modQueue.length >= alertThreshold) {
        console.log(`Alerting: Queue length of ${modQueue.length} is over threshold of ${alertThreshold}`);
        shouldAlert = true;
    } else {
        console.log(`Alerting: Queue length ${modQueue.length} is under threshold.`);
    }

    let agedItems: QueuedItemProperties[] = [];
    let oldestItem: QueuedItemProperties | undefined;
    if (alertAgeHours && queueItemProps && queueItemProps.length > 0) {
        agedItems = queueItemProps.filter(item => new Date(item.queueDate) < subHours(new Date(), alertAgeHours));
        oldestItem = queueItemProps.sort((a, b) => a.queueDate - b.queueDate)[0];
    }

    if (agedItems.length > 0 && alertAgeHours) {
        console.log(`Alerting: Found ${agedItems.length} items over ${alertAgeHours} old`);
        shouldAlert = true;
    }

    if (oldestItem) {
        console.log(`Alerting: Oldest item: ${formatDurationToNow(new Date(oldestItem.queueDate))}`);
    }

    const redisKey = "PauseAlerting";
    const shouldPauseAlerting = await context.redis.get(redisKey);

    if (shouldPauseAlerting) {
        console.log("Alerting: Alerting is paused due to previous alert being sent.");
        if (!shouldAlert) {
            const currentExpiry = await context.redis.expireTime(redisKey);
            const fifteenMinutes = 15 * 60 - 30; // 30 seconds subtracted to prevent race conditions
            if (currentExpiry <= 0 || currentExpiry > fifteenMinutes) {
                // No longer in an alerting period. Set timeout for 15 minutes to avoid back to back alerts
                // when in the middle of a queue cleanout
                console.log("Alerting: Alert conditions no longer met, setting 15 minute timeout");
                await context.redis.expire(redisKey, fifteenMinutes);
            }
        }
        return;
    }

    if (!shouldAlert) {
        console.log("Alerting: Conditions not met for alerting.");
        return;
    }

    const subredditName = await getSubredditName(context);

    const roleId = settings[AppSetting.RoleToPing] as string | undefined;

    let message = `The [modqueue](<https://www.reddit.com/r/${subredditName}/about/modqueue>) on /r/${subredditName} needs attention.`;
    if (roleId) {
        message += ` <@&${roleId}>`;
    }

    message += `\n* There ${pluralize("is", modQueue.length)} currently ${modQueue.length} ${pluralize("item", modQueue.length)} in the queue\n`;

    if (agedItems.length > 0) {
        message += `* ${agedItems.length} ${pluralize("item", agedItems.length)} ${pluralize("is", modQueue.length)} over ${alertAgeHours} ${pluralize("hour", alertAgeHours)} old.`;
        if (oldestItem && oldestItem.itemId) {
            let target: Post | Comment;
            if (oldestItem.itemId.startsWith(ThingPrefix.Post)) {
                target = await context.reddit.getPostById(oldestItem.itemId);
            } else {
                target = await context.reddit.getCommentById(oldestItem.itemId);
            }
            message += ` [Oldest item](<https://www.reddit.com${target.permalink}>).`;
        }
        message += "\n";
    } else if (oldestItem) {
        message += `* Oldest queue item: ${formatDurationToNow(new Date(oldestItem.queueDate))}\n`;
    }

    const alertThresholdForIndividualPosts = settings[AppSetting.AlertThresholdForIndividualPosts] as number | undefined;

    // Check to see if any posts represent a large proportion of the modqueue
    if (alertThreshold && alertThresholdForIndividualPosts && modQueue.length >= alertThreshold) {
        const topQueuePosts = getTopPosts(modQueue, alertThresholdForIndividualPosts);
        for (const item of topQueuePosts) {
            // eslint-disable-next-line no-await-in-loop
            const post = await context.reddit.getPostById(item.postId);
            message += `* Queue items from one post make up ${Math.round(100 * item.count / modQueue.length)}% of queue entries: [${markdownEscape(post.title)}](<https://www.reddit.com${post.permalink}>)\n`;
        }
    }

    try {
        const params = {
            content: message,
        };

        await fetch(
            discordWebhookUrl,
            {
                method: "post",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(params),
            }
        );
    } catch (error) {
        console.log(error);
    }

    // Record that we're in an alerting period with an expiry of a day.
    await context.redis.set(redisKey, "true", {expiration: addDays(new Date(), 1)});
}

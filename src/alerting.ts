import {Comment, Post, TriggerContext} from "@devvit/public-api";
import {Settings} from "./settings.js";
import {addDays, addHours, compareAsc} from "date-fns";
import {formatDurationToNow, getSubredditName} from "./utility.js";
import pluralize from "pluralize";
import {QueuedItemProperties} from "./handleActions.js";

export async function checkAlerting (modQueue: (Post | Comment)[], queueItemProps: QueuedItemProperties[], context: TriggerContext) {
    const settings = await context.settings.getAll();
    const alertingEnabled = settings[Settings.EnableAlerts] as boolean;
    if (!alertingEnabled) {
        console.log("Alerting: Alerting is disabled.");
        return;
    }

    const discordWebhookUrl = settings[Settings.DiscordWebhook] as string;
    if (!discordWebhookUrl) {
        console.log("Alerting: Webhook is not set up!");
        return;
    }

    let shouldAlert = false;
    const alertThreshold = settings[Settings.AlertThreshold] as number;
    const alertAgeHours = settings[Settings.AlertAgeHours] as number;

    if (modQueue.length >= alertThreshold) {
        console.log(`Alerting: Queue length of ${modQueue.length} is over threshold of ${alertThreshold}`);
        shouldAlert = true;
    } else {
        console.log(`Alerting: Queue length ${modQueue.length} is under threshold.`);
    }

    const queueItemAges = queueItemProps.map(x => new Date(x.queueDate));
    let agedItems: Date[] = [];
    let oldestItem: Date | undefined;
    if (queueItemAges && queueItemAges.length > 0) {
        agedItems = queueItemAges.filter(item => item < addHours(new Date(), -alertAgeHours));
        oldestItem = queueItemAges.sort(compareAsc)[0];
    }

    if (agedItems.length > 0) {
        console.log(`Alerting: Found ${agedItems.length} items over ${alertAgeHours} old`);
        shouldAlert = true;
    }

    if (oldestItem) {
        console.log(`Alerting: Oldest item: ${formatDurationToNow(oldestItem)}`);
    }

    const redisKey = "PauseAlerting";
    const shouldPauseAlerting = await context.redis.get(redisKey);

    if (shouldPauseAlerting) {
        console.log("Alerting: Alerting is paused due to previous alert being sent.");
        if (!shouldAlert) {
            const currentExpiry = await context.redis.expireTime(redisKey);
            const fifteenMinutes = 15 * 60;
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

    const roleId = settings[Settings.RoleToPing] as string | undefined;

    let message = `The modqueue on /r/${subredditName} needs attention.`;
    if (roleId) {
        message += ` <@&${roleId}>`;
    }

    message += `\n* There are currently ${modQueue.length} ${pluralize("item", modQueue.length)} in the queue\n`;

    if (agedItems.length > 0) {
        message += `* ${agedItems.length} ${pluralize("item", agedItems.length)} are over ${alertAgeHours} ${pluralize("hour", alertAgeHours)} old.\n`;
    }
    if (oldestItem) {
        message += `* Oldest queue item: ${formatDurationToNow(oldestItem)}`;
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

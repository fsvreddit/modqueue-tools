import { Comment, Post, TriggerContext } from "@devvit/public-api";
import { AppSetting, UnderThresholdAction } from "./settings.js";
import { addDays, addMinutes, subHours } from "date-fns";
import { formatDurationToNow } from "./utility.js";
import pluralize from "pluralize";
import { QueuedItemProperties } from "./handleActions.js";
import markdownEscape from "markdown-escape";
import { countBy } from "lodash";
import { isLinkId } from "@devvit/public-api/types/tid.js";

interface QueuedPostCount {
    postId: string;
    count: number;
}

interface WebhookThresholds {
    threshold?: number;
    ageHours?: number;
}

function getTopPosts (modQueue: (Post | Comment)[], threshold: number): QueuedPostCount[] {
    const postIdList = modQueue.map(item => item instanceof Comment ? item.postId : item.id);
    const countedPosts = countBy(postIdList);
    const postsInQueue: QueuedPostCount[] = Object.keys(countedPosts).map(postId => ({ postId, count: countedPosts[postId] }));

    return postsInQueue.filter(item => Math.round(100 * item.count / modQueue.length) >= threshold).sort((a, b) => b.count - a.count);
}

export async function checkAlerting (modQueue: (Post | Comment)[], queueItemProps: QueuedItemProperties[], context: TriggerContext) {
    const settings = await context.settings.getAll();
    if (!settings[AppSetting.EnableAlerts]) {
        console.log("Alerting: Alerting is disabled.");
        return;
    }

    const discordWebhookUrls = getDiscordWebhookUrls(settings[AppSetting.DiscordWebhook] as string);
    if (discordWebhookUrls.length === 0) {
        console.log("Alerting: Webhook is not set up!");
        return;
    }

    const globalAlertThreshold = settings[AppSetting.AlertThreshold] as number;
    const globalAlertAgeHours = settings[AppSetting.AlertAgeHours] as number;
    const webhookConfig = settings[AppSetting.DiscordWebhookConfig] as string;
    const thresholdsPerWebhook = parseWebhookConfig(webhookConfig, discordWebhookUrls, globalAlertThreshold, globalAlertAgeHours);

    let agedItems: QueuedItemProperties[] = [];
    let oldestItem: QueuedItemProperties | undefined;

    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();
    const alertMessageIdKey = "AlertMessageIds";
    const alertMessageIdsStr = await context.redis.get(alertMessageIdKey);
    const alertMessageIds = alertMessageIdsStr ? JSON.parse(alertMessageIdsStr) as Record<string, string> : {};
    const maxQueueLengthKey = "MaxQueueLengthObserved";
    const previousMaxQueueLengthStr = await context.redis.get(maxQueueLengthKey);
    const previousMaxQueueLength = previousMaxQueueLengthStr ? parseInt(previousMaxQueueLengthStr, 10) : 0;
    const alertingPausedKey = "AlertingPaused";

    // Check for aged items once
    if (globalAlertAgeHours && queueItemProps.length > 0) {
        agedItems = queueItemProps.filter(item => new Date(item.queueDate) < subHours(new Date(), globalAlertAgeHours));
        oldestItem = queueItemProps.sort((a, b) => a.queueDate - b.queueDate)[0];
    }

    if (oldestItem) {
        console.log(`Alerting: Oldest item: ${formatDurationToNow(new Date(oldestItem.queueDate))}`);
    }

    // Check if alerting is paused globally
    if (await context.redis.exists(alertingPausedKey)) {
        console.log("Alerting: Alerting is currently paused, skipping alert.");
        return;
    }

    // Determine which webhooks should alert
    const webhooksToAlert: string[] = [];
    const webhooksToDeactivate: string[] = [];

    for (const webhookUrl of discordWebhookUrls) {
        const thresholds = thresholdsPerWebhook[webhookUrl];
        const alertThreshold = thresholds.threshold ?? globalAlertThreshold;
        const alertAgeHours = thresholds.ageHours ?? globalAlertAgeHours;

        let shouldAlertForThisWebhook = false;

        if (alertThreshold && modQueue.length >= alertThreshold) {
            console.log(`Alerting: Queue length of ${modQueue.length} is over threshold of ${alertThreshold} for webhook ${webhookUrl}`);
            shouldAlertForThisWebhook = true;
        }

        if (agedItems.length > 0 && alertAgeHours) {
            console.log(`Alerting: Found ${agedItems.length} items over ${alertAgeHours} old for webhook ${webhookUrl}`);
            shouldAlertForThisWebhook = true;
        }

        if (shouldAlertForThisWebhook) {
            webhooksToAlert.push(webhookUrl);
        } else {
            webhooksToDeactivate.push(webhookUrl);
        }
    }

    // Handle deactivation for webhooks that are under threshold
    if (webhooksToDeactivate.length > 0) {
        const [underAlertAction] = settings[AppSetting.UnderThresholdAction] as UnderThresholdAction[] | undefined ?? [UnderThresholdAction.None];
        if (underAlertAction === UnderThresholdAction.DeleteMessage) {
            console.log("Alerting: Deleting alert messages as queue is under threshold.");
            for (const webhookUrl of webhooksToDeactivate) {
                const messageId = alertMessageIds[webhookUrl];
                if (messageId) {
                    await deleteWebhookMessage(webhookUrl, messageId);
                    delete alertMessageIds[webhookUrl];
                }
            }
        } else if (underAlertAction === UnderThresholdAction.UpdateMessage) {
            console.log("Alerting: Updating alert messages as queue is under threshold.");
            const message = `✅ The [modqueue](<https://www.reddit.com/r/${subredditName}/about/modqueue>) on /r/${subredditName} is now under the alerting thresholds. There ${pluralize("are", modQueue.length)} currently ${modQueue.length} ${pluralize("item", modQueue.length)} in the queue, and the maximum queue length seen was ${previousMaxQueueLength}.`;
            for (const webhookUrl of webhooksToDeactivate) {
                const messageId = alertMessageIds[webhookUrl];
                if (messageId) {
                    await updateWebhookMessage(webhookUrl, messageId, message);
                }
            }
        }
    }

    // If no webhooks should alert, pause alerting and return
    if (webhooksToAlert.length === 0) {
        console.log("Alerting: No webhooks meet alerting conditions.");
        // Only delete/clear the redis keys if all webhooks are under threshold
        if (webhooksToDeactivate.length === discordWebhookUrls.length) {
            await context.redis.del(alertMessageIdKey, maxQueueLengthKey);
            // Pause alerting for 15 minutes to avoid repeated alerts
            await context.redis.set(alertingPausedKey, "", { expiration: addMinutes(new Date(), 15) });
        }
        return;
    }

    if (modQueue.length > previousMaxQueueLength) {
        await context.redis.set(maxQueueLengthKey, modQueue.length.toString());
    }

    const roleId = settings[AppSetting.RoleToPing] as string | undefined;

    let message = `⚠️ The [modqueue](<https://www.reddit.com/r/${subredditName}/about/modqueue>) on /r/${subredditName} needs attention.`;
    if (roleId) {
        message += ` <@&${roleId}>`;
    }

    message += ` As at <t:${Math.round(Date.now() / 1000)}:t>:`;

    message += `\n* There ${pluralize("is", modQueue.length)} currently ${modQueue.length} ${pluralize("item", modQueue.length)} in the queue\n`;

    if (agedItems.length > 0) {
        message += `* ${agedItems.length} ${pluralize("item", agedItems.length)} ${pluralize("is", agedItems.length)} over ${globalAlertAgeHours} ${pluralize("hour", globalAlertAgeHours)} old.`;
        if (oldestItem?.itemId) {
            let target: Post | Comment;
            if (isLinkId(oldestItem.itemId)) {
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

    // Check to see if any posts represent a large proportion of the mod queue
    if (globalAlertThreshold && alertThresholdForIndividualPosts && modQueue.length >= globalAlertThreshold) {
        const topQueuePosts = getTopPosts(modQueue, alertThresholdForIndividualPosts);
        for (const item of topQueuePosts) {
            const post = await context.reddit.getPostById(item.postId);
            message += `* Queue items from one post make up ${Math.round(100 * item.count / modQueue.length)}% of queue entries: [${markdownEscape(post.title)}](<https://www.reddit.com${post.permalink}>)\n`;
        }
    }

    const hasExistingMessage = Object.keys(alertMessageIds).length > 0;
    if (hasExistingMessage) {
        for (const webhookUrl of webhooksToAlert) {
            const messageId = alertMessageIds[webhookUrl];
            if (messageId) {
                await updateWebhookMessage(webhookUrl, messageId, message);
            } else {
                const newMessageId = await sendMessageToWebhook(webhookUrl, message);
                if (newMessageId) {
                    alertMessageIds[webhookUrl] = newMessageId;
                }
            }
        }
        console.log("Alerting: Updated existing alert messages.");
    } else {
        for (const webhookUrl of webhooksToAlert) {
            const newMessageId = await sendMessageToWebhook(webhookUrl, message);
            if (newMessageId) {
                alertMessageIds[webhookUrl] = newMessageId;
            }
        }
        console.log("Alerting: Sent new alert messages.");
    }

    // Record that we're in an alerting period with an expiry of a day
    if (Object.keys(alertMessageIds).length > 0) {
        await context.redis.set(alertMessageIdKey, JSON.stringify(alertMessageIds), { expiration: addDays(new Date(), 1) });
    }
}

async function sendMessageToWebhook (webhookUrl: string, message: string): Promise<string | undefined> {
    const params = {
        content: message,
    };

    const pathParams = new URLSearchParams();
    pathParams.append("wait", "true");

    try {
        const result = await fetch(
            `${webhookUrl}?${pathParams}`,
            {
                method: "post",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(params),
            },
        );
        console.log("Webhook message sent, status:", result.status);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const json = await result.json();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return json.id;
    } catch (error) {
        console.error("Error sending message to webhook:", error);
    }
}

async function updateWebhookMessage (webhookUrl: string, messageId: string, newMessage: string): Promise<void> {
    const params = {
        content: newMessage,
    };

    try {
        const result = await fetch(
            `${webhookUrl}/messages/${messageId}`,
            {
                method: "patch",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(params),
            },
        );
        console.log("Webhook message updated, status:", result.status);
    } catch (error) {
        console.error("Error updating message to webhook:", error);
    }
}

async function deleteWebhookMessage (webhookUrl: string, messageId: string): Promise<void> {
    try {
        const result = await fetch(
            `${webhookUrl}/messages/${messageId}`,
            {
                method: "delete",
            },
        );
        console.log("Webhook message deleted, status:", result.status);
    } catch (error) {
        console.error("Error deleting message to webhook:", error);
    }
}

function getDiscordWebhookUrls (webhookSetting: string | undefined): string[] {
    if (!webhookSetting) {
        return [];
    }
    return webhookSetting
        .trim()
        .split(/\n+/)
        .map(url => url.trim())
        .filter(url => url.length > 0);
}

function parseWebhookConfig (
    configSetting: string | undefined,
    webhookUrls: string[],
    defaultThreshold: number,
    defaultAgeHours: number,
): Record<string, WebhookThresholds> {
    const result: Record<string, WebhookThresholds> = {};

    // Initialize all webhooks with default thresholds
    for (const url of webhookUrls) {
        result[url] = {
            threshold: defaultThreshold,
            ageHours: defaultAgeHours,
        };
    }

    if (!configSetting) {
        return result;
    }

    const configs = configSetting
        .trim()
        .split(/\n+/)
        .filter(c => c.trim());

    for (const config of configs) {
        const parts = config.trim().split("|");
        const url = parts[0].trim();

        if (!webhookUrls.includes(url)) {
            console.log(`Alerting: Webhook URL in config not found in main list: ${url}`);
            continue;
        }

        const thresholds: WebhookThresholds = {
            threshold: defaultThreshold,
            ageHours: defaultAgeHours,
        };

        for (let i = 1; i < parts.length; i++) {
            const [key, value] = parts[i].split(":").map(s => s.trim());
            if (key === "threshold") {
                thresholds.threshold = parseInt(value, 10);
            } else if (key === "ageHours") {
                thresholds.ageHours = parseInt(value, 10);
            }
        }

        result[url] = thresholds;
    }

    return result;
}

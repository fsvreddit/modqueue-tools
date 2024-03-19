import {TriggerContext, WikiPage, WikiPagePermissionLevel, ZMember} from "@devvit/public-api";
import {formatDurationToNow, getSubredditName} from "./utility.js";
import {ACTION_DELAY_KEY, QUEUE_LENGTH_KEY} from "./redisHelper.js";
import {subDays, subMonths, subSeconds} from "date-fns";

interface QueueLength {
    dateTime: Date,
    queueLength: number,
    numSamples: number,
}

interface ActionDelay {
    dateTime: Date,
    actionDelayInSeconds: number
    numSamples: number,
}

export interface AggregatedSample {
    value: number,
    numSamples: number
}

export function average (input: AggregatedSample[]): number {
    let total = 0;
    let numSamples = 0;

    for (const item of input) {
        total += item.value * item.numSamples;
        numSamples += item.numSamples;
    }

    return total / numSamples;
}

export function max (input: AggregatedSample[]): number {
    return input.map(item => item.value).sort((a, b) => b - a)[0];
}

function secondsToFormattedDuration (seconds: number): string {
    return formatDurationToNow(subSeconds(new Date(), seconds));
}

function queueLengthRedisItemToObject (item: ZMember): QueueLength {
    const [, queueLength, numSamples = "1"] = item.member.split("~");
    return {
        dateTime: new Date(item.score),
        queueLength: parseFloat(queueLength),
        numSamples: parseInt(numSamples),
    };
}

function actionDelayRedisItemToObject (item: ZMember): ActionDelay {
    const [, , actionDelayInSeconds, numSamples = "1"] = item.member.split("~");
    return {
        dateTime: new Date(item.score),
        actionDelayInSeconds: parseFloat(actionDelayInSeconds),
        numSamples: parseInt(numSamples),
    };
}

export async function refreshWikiPage (context: TriggerContext) {
    const wikiPageName = "modqueue-tools/queuestats";

    // Remove entries older than three months from Redis.
    const logCutoff = subMonths(new Date(), 3).getTime();
    await context.redis.zRemRangeByScore(QUEUE_LENGTH_KEY, 0, logCutoff);
    await context.redis.zRemRangeByScore(ACTION_DELAY_KEY, 0, logCutoff);

    const queueLengthItems = await context.redis.zRange(QUEUE_LENGTH_KEY, 0, -1);
    const queueLengths = queueLengthItems.map(item => queueLengthRedisItemToObject(item));

    const actionDelayItems = await context.redis.zRange(ACTION_DELAY_KEY, 0, -1);
    console.log(actionDelayItems);
    const actionDelays = actionDelayItems.map(item => actionDelayRedisItemToObject(item));

    if (queueLengths.length === 0) {
        // No data. Return.
    }

    let pageContents = "# Modqueue Statistics\n\n";

    pageContents += "Last 24 hours\n\n";
    const last24Hours = subDays(new Date(), 1);
    const last24HoursQueueLengths = queueLengths.filter(item => item.dateTime > last24Hours);
    if (last24HoursQueueLengths.length > 0) {
        pageContents += `* Average queue length: ${Math.floor(average(last24HoursQueueLengths.map(item => (<AggregatedSample>{value: item.queueLength, numSamples: item.numSamples}))))}\n`;
        const peakQueueLength = last24HoursQueueLengths.sort((a, b) => b.queueLength - a.queueLength)[0];
        pageContents += `* Peak queue length: ${Math.floor(peakQueueLength.queueLength)} at ${peakQueueLength.dateTime.toUTCString()}\n`;
    } else {
        pageContents += "* No queue lengths recorded in the last 24 hours.\n";
    }

    const last24HoursActionDelays = actionDelays.filter(item => item.dateTime > last24Hours);
    if (last24HoursActionDelays.length > 0) {
        console.log(last24HoursActionDelays.length);
        const samples = last24HoursActionDelays.map(item => (<AggregatedSample>{value: item.actionDelayInSeconds, numSamples: item.numSamples}));
        console.log(JSON.stringify(samples));
        pageContents += `* Mod actions in last 24 hours: ${last24HoursActionDelays.length} (excludes AutoModerator and Reddit actions)\n`;
        pageContents += `* Average time to handle a queue item: ${secondsToFormattedDuration(average(samples))}\n`;
        pageContents += `* Maximum time to handle a queue item: ${secondsToFormattedDuration(max(samples))}\n`;
    } else {
        pageContents += "* No mod actions recorded in the last 24 hours.\n";
    }

    const earliestTimeRecorded = queueLengths.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()).map(item => item.dateTime)[0];
    pageContents += `\nSince ${earliestTimeRecorded.toUTCString()}\n\n`;

    if (queueLengths.length > 0) {
        pageContents += `* Average queue length: ${Math.floor(average(queueLengths.map(item => (<AggregatedSample>{value: item.queueLength, numSamples: item.numSamples}))))}\n`;
        const peakQueueLength = queueLengths.sort((a, b) => b.queueLength - a.queueLength)[0];
        pageContents += `* Peak queue length: ${peakQueueLength.queueLength} at ${peakQueueLength.dateTime.toUTCString()}\n`;
    } else {
        pageContents += "* No queue lengths recorded in the last 24 hours.\n";
    }

    if (last24HoursActionDelays.length > 0) {
        pageContents += `* Mod actions: ${actionDelays.length} (excludes AutoModerator and Reddit actions)\n`;
        pageContents += `* Average time to handle a queue item: ${secondsToFormattedDuration(average(actionDelays.map(item => (<AggregatedSample>{value: item.actionDelayInSeconds, numSamples: item.numSamples}))))}\n`;
        pageContents += `* Maximum time to handle a queue item: ${secondsToFormattedDuration(max(actionDelays.map(item => (<AggregatedSample>{value: item.actionDelayInSeconds, numSamples: item.numSamples}))))}\n`;
    } else {
        pageContents += "* No mod actions recorded.\n";
    }

    pageContents += "\nThis app only reports on actions and queue lengths seen since the app was installed. Mod actions includes approve/remove actions on modqueue items only, not actions taken elsewhere.\n\n";

    const subredditName = await getSubredditName(context);

    let wikiPage: WikiPage | undefined;
    try {
        wikiPage = await context.reddit.getWikiPage(subredditName, wikiPageName);
    } catch {
        //
    }

    const wikiPageOptions = {
        subredditName,
        page: wikiPageName,
        content: pageContents,
        reason: "Updated Modqueue Tools Statistics",
    };

    if (wikiPage) {
        await context.reddit.updateWikiPage(wikiPageOptions);
    } else {
        await context.reddit.createWikiPage(wikiPageOptions);
        await context.reddit.updateWikiPageSettings({
            subredditName,
            page: wikiPageName,
            listed: true,
            permLevel: WikiPagePermissionLevel.MODS_ONLY,
        });
    }
}

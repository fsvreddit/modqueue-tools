import {TriggerContext, WikiPage, WikiPagePermissionLevel} from "@devvit/public-api";
import {formatDurationToNow, getSubredditName} from "./utility.js";
import {ACTION_DELAY_KEY, ACTION_DELAY_KEY_HOURLY, QUEUE_LENGTH_KEY, QUEUE_LENGTH_KEY_HOURLY} from "./redisHelper.js";
import {differenceInHours, differenceInMilliseconds, subDays, subSeconds} from "date-fns";
import {ActionDelay, AggregatedSample, QueueLength, actionDelayRedisItemToObject, aggregateObjectToActionDelay, aggregateObjectToQueueLength, average, queueLengthRedisItemToObject} from "./typesAndConversion.js";
import _ from "lodash";

function secondsToFormattedDuration (seconds: number): string {
    return formatDurationToNow(subSeconds(new Date(), seconds));
}

async function getQueueLengths (context: TriggerContext): Promise<QueueLength[]> {
    const queueLengthItems = await context.redis.zRange(QUEUE_LENGTH_KEY, 0, -1);
    const queueLengths = queueLengthItems.map(item => queueLengthRedisItemToObject(item));
    const aggregatedItems = await context.redis.hgetall(QUEUE_LENGTH_KEY_HOURLY);
    if (aggregatedItems) {
        queueLengths.push(...Object.values(aggregatedItems).map(aggregateObjectToQueueLength));
    }
    return queueLengths;
}

async function getActionDelays (context: TriggerContext): Promise<ActionDelay[]> {
    const actionDelayItems = await context.redis.zRange(ACTION_DELAY_KEY, 0, -1);
    const actionDelays = actionDelayItems.map(actionDelayRedisItemToObject);

    const aggregatedItems = await context.redis.hgetall(ACTION_DELAY_KEY_HOURLY);
    if (aggregatedItems) {
        actionDelays.push(...Object.values(aggregatedItems).map(aggregateObjectToActionDelay));
    }

    return actionDelays;
}

export async function refreshWikiPage (context: TriggerContext) {
    const wikiPageName = "modqueue-tools/queuestats";
    const startTime = new Date();

    const queueLengths = await getQueueLengths(context);
    const actionDelays = await getActionDelays(context);

    if (queueLengths.length === 0) {
        // No data. Return.
    }

    let pageContents = "# Modqueue Statistics\n\n";

    pageContents += "Last 24 hours\n\n";
    const last24Hours = subDays(new Date(), 1);
    const last24HoursQueueLengths = queueLengths.filter(item => item.dateTime > last24Hours);
    if (last24HoursQueueLengths.length > 0) {
        pageContents += `* Average queue length: ${Math.round(average(last24HoursQueueLengths.map(item => (<AggregatedSample>{meanValue: item.queueLength, maxValue: item.queueLength, numSamples: item.numSamples}))))}\n`;
        const peakQueueLength = last24HoursQueueLengths.sort((a, b) => b.queueLength - a.queueLength)[0];
        pageContents += `* Peak queue length: ${Math.round(peakQueueLength.queueLength)} at ${peakQueueLength.dateTime.toUTCString()}\n`;
    } else {
        pageContents += "* No queue lengths recorded in the last 24 hours.\n";
    }

    const last24HoursActionDelays = actionDelays.filter(item => item.dateTime > last24Hours);
    if (last24HoursActionDelays.length > 0) {
        const samples = last24HoursActionDelays.map(item => (<AggregatedSample>{meanValue: item.actionDelayInSeconds, maxValue: item.actionDelayInSeconds, numSamples: item.numSamples}));
        const maximum = _.max(last24HoursActionDelays.map(item => item.maxActionDelayInSeconds)) ?? 0;
        pageContents += `* Mod actions in last 24 hours: ${_.sum(last24HoursActionDelays.map(x => x.numSamples))} (excludes AutoModerator and Reddit actions)\n`;
        pageContents += `* Average time to handle a queue item: ${secondsToFormattedDuration(average(samples))}\n`;
        pageContents += `* Maximum time to handle a queue item: ${secondsToFormattedDuration(maximum)}\n`;
    } else {
        pageContents += "* No mod actions recorded in the last 24 hours.\n";
    }

    const earliestTimeRecorded = _.min(queueLengths.map(x => x.dateTime));

    if (earliestTimeRecorded) {
        pageContents += `\nSince ${earliestTimeRecorded.toUTCString()}:\n\n`;
    } else {
        pageContents += "\nSince app install:\n\n";
    }

    if (queueLengths.length > 0) {
        pageContents += `* Average queue length: ${Math.round(average(queueLengths.map(item => (<AggregatedSample>{meanValue: item.queueLength, maxValue: item.queueLength, numSamples: item.numSamples}))))}\n`;
        const peakQueueLength = queueLengths.sort((a, b) => b.queueLength - a.queueLength)[0];
        pageContents += `* Peak queue length: ${Math.round(peakQueueLength.queueLength)} at ${peakQueueLength.dateTime.toUTCString()}\n`;
    } else {
        pageContents += "* No queue lengths recorded in the last 24 hours.\n";
    }

    if (actionDelays.length > 0) {
        const samples = actionDelays.map(item => (<AggregatedSample>{meanValue: item.actionDelayInSeconds, maxValue: item.actionDelayInSeconds, numSamples: item.numSamples}));
        const maximum = _.max(actionDelays.map(item => item.maxActionDelayInSeconds)) ?? 0;
        pageContents += `* Mod actions: ${_.sum(actionDelays.map(item => item.numSamples))} (excludes AutoModerator and Reddit actions)\n`;
        if (earliestTimeRecorded) {
            pageContents += `* Average actions/day: ${Math.round(_.sum(actionDelays.map(item => item.numSamples)) / differenceInHours(new Date(), earliestTimeRecorded) * 24)}\n`;
        }
        pageContents += `* Average time to handle a queue item: ${secondsToFormattedDuration(average(samples))}\n`;
        pageContents += `* Maximum time to handle a queue item: ${secondsToFormattedDuration(maximum)}\n`;
    } else {
        pageContents += "* No mod actions recorded.\n";
    }

    pageContents += "\nThis app only reports on actions and queue lengths seen since the app was installed. Mod actions includes approve/remove actions on modqueue items only, not actions taken elsewhere.\n\n";
    pageContents += `^(This page was generated in ${differenceInMilliseconds(new Date(), startTime)} ms)\n\n`;

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

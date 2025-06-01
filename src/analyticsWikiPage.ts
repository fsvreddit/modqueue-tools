import { TriggerContext, WikiPage, WikiPagePermissionLevel } from "@devvit/public-api";
import { formatDurationToNow, getSubredditName } from "./utility.js";
import { ACTION_DELAY_KEY, ACTION_DELAY_KEY_HOURLY, QUEUE_LENGTH_KEY, QUEUE_LENGTH_KEY_HOURLY } from "./redisHelper.js";
import { compareDesc, differenceInHours, eachDayOfInterval, getHours, isSameDay, subDays, subSeconds } from "date-fns";
import { ActionDelay, AggregatedSample, QueueLength, actionDelayRedisItemToObject, aggregateObjectToActionDelay, aggregateObjectToQueueLength, average, queueLengthRedisItemToObject } from "./typesAndConversion.js";
import { max, min, sum } from "lodash";
import json2md from "json2md";

function secondsToFormattedDuration (seconds: number): string {
    return formatDurationToNow(subSeconds(new Date(), seconds));
}

async function getQueueLengths (context: TriggerContext): Promise<QueueLength[]> {
    const queueLengthItems = await context.redis.zRange(QUEUE_LENGTH_KEY, 0, -1);
    const queueLengths = queueLengthItems.map(item => queueLengthRedisItemToObject(item));
    const aggregatedItems = await context.redis.hGetAll(QUEUE_LENGTH_KEY_HOURLY);
    queueLengths.push(...Object.values(aggregatedItems).map(aggregateObjectToQueueLength));
    return queueLengths;
}

async function getActionDelays (context: TriggerContext): Promise<ActionDelay[]> {
    const actionDelayItems = await context.redis.zRange(ACTION_DELAY_KEY, 0, -1);
    const actionDelays = actionDelayItems.map(actionDelayRedisItemToObject);

    const aggregatedItems = await context.redis.hGetAll(ACTION_DELAY_KEY_HOURLY);
    actionDelays.push(...Object.values(aggregatedItems).map(aggregateObjectToActionDelay));

    return actionDelays;
}

function numberToBlocks (number: number, maximum: number) {
    if (maximum === 0) {
        return "";
    }

    const maxBlocks = 6;
    const blockCount = maxBlocks * number / maximum;
    const subBlock = blockCount % 1;
    const finalCharacter = subBlock >= 0.5 ? "▌" : "";

    return "█".repeat(Math.floor(blockCount)) + finalCharacter;
}

function cappedNumber (input: number, maximum = 1000): string {
    if (input < maximum) {
        return input.toString();
    }

    return `> ${maximum}`;
}

export async function refreshWikiPage (context: TriggerContext) {
    const wikiPageName = "modqueue-tools/queuestats";

    const queueLengths = await getQueueLengths(context);
    const actionDelays = await getActionDelays(context);

    if (queueLengths.length === 0) {
        console.log("No data exists. Skipping wiki page update.");
        // No data. Return.
    }

    const pageContents: json2md.DataObject[] = [
        { h1: "Modqueue Statistics" },
    ];

    const earliestTimeRecorded = min(queueLengths.map(x => x.dateTime));

    const daysForSummaryTable = 28;
    const summaryStart = max([earliestTimeRecorded, subDays(new Date(), daysForSummaryTable)]) ?? subDays(new Date(), daysForSummaryTable);
    const days = eachDayOfInterval({ start: summaryStart, end: subDays(new Date(), 1) }).sort(compareDesc);

    const maxQueueLength = max(queueLengths.filter(item => item.dateTime > summaryStart).map(item => item.queueLength)) ?? 0;
    const queueBarMax = max([maxQueueLength, 10]) ?? 10;

    const dayRows: string[][] = [];
    const dayHeaders = ["Date", "Average Queue", "Peak Queue", "Average Time before action", "Max Time before action", "Mod Actions"];

    if (days.length) {
        for (const day of days) {
            const queueLengthsForDay = queueLengths.filter(item => isSameDay(item.dateTime, day));
            const actionDelaysForDay = actionDelays.filter(item => isSameDay(item.dateTime, day));

            if (queueLengthsForDay.length) {
                const averageQueueLength = Math.round(average(queueLengthsForDay.map(item => ({ meanValue: item.queueLength, maxValue: item.queueLength, numSamples: item.numSamples } as AggregatedSample))));
                const peakQueueLength = queueLengthsForDay.sort((a, b) => b.queueLength - a.queueLength)[0];
                const averageActionDelay = Math.round(average(actionDelaysForDay.map(item => ({ meanValue: item.actionDelayInSeconds, maxValue: item.actionDelayInSeconds, numSamples: item.numSamples } as AggregatedSample))));
                const maximumActionDelay = max(actionDelaysForDay.map(item => item.maxActionDelayInSeconds)) ?? 0;
                const modActions = sum(actionDelaysForDay.map(item => item.numSamples));

                dayRows.push([
                    day.toDateString(),
                    `${numberToBlocks(averageQueueLength, maxQueueLength / 2)} ${cappedNumber(averageQueueLength)}`,
                    `${numberToBlocks(Math.round(peakQueueLength.queueLength), queueBarMax)} ${cappedNumber(Math.round(peakQueueLength.queueLength))}`,
                    secondsToFormattedDuration(averageActionDelay),
                    secondsToFormattedDuration(maximumActionDelay),
                    cappedNumber(modActions),
                ]);
            }
        }
    }

    pageContents.push({ table: { headers: dayHeaders, rows: dayRows } });

    if (earliestTimeRecorded) {
        pageContents.push({ p: `Since ${earliestTimeRecorded.toUTCString()}:` });
    } else {
        pageContents.push({ p: "Since app install:" });
    }

    const bullets: string[] = [];
    if (queueLengths.length > 0) {
        bullets.push(`Average queue length: ${Math.round(average(queueLengths.map(item => ({ meanValue: item.queueLength, maxValue: item.queueLength, numSamples: item.numSamples } as AggregatedSample))))}`);
        const peakQueueLength = queueLengths.sort((a, b) => b.queueLength - a.queueLength)[0];
        bullets.push(`Peak queue length: ${Math.round(peakQueueLength.queueLength)} at ${peakQueueLength.dateTime.toUTCString()}`);
    } else {
        bullets.push("No queue lengths recorded in the last 24 hours.");
    }

    if (actionDelays.length > 0) {
        const samples = actionDelays.map(item => ({ meanValue: item.actionDelayInSeconds, maxValue: item.actionDelayInSeconds, numSamples: item.numSamples } as AggregatedSample));
        const maximum = max(actionDelays.map(item => item.maxActionDelayInSeconds)) ?? 0;
        bullets.push(`Mod actions: ${sum(actionDelays.map(item => item.numSamples))} (excludes AutoModerator and Reddit actions)`);
        if (earliestTimeRecorded) {
            bullets.push(`Average actions/day: ${Math.round(sum(actionDelays.map(item => item.numSamples)) / differenceInHours(new Date(), earliestTimeRecorded) * 24)}`);
        }
        bullets.push(`Average time to handle a queue item: ${secondsToFormattedDuration(average(samples))}`);
        bullets.push(`Maximum time to handle a queue item: ${secondsToFormattedDuration(maximum)}`);
    } else {
        bullets.push("No mod actions recorde.");
    }

    pageContents.push({ ul: bullets });

    pageContents.push({ h2: "Time of day statistics" });
    pageContents.push({ p: "This covers the last four weeks worth of data." });

    const timeRows: string[][] = [];
    const timeHeadings = ["Hour", "Average Queue Size", "Average Action Count", "Average Action Delay"];

    const maxBar = max([...queueLengths.filter(x => x.dateTime > summaryStart).map(x => x.maxQueueLength), ...actionDelays.filter(x => x.dateTime > summaryStart).map(x => x.numSamples)]) ?? 0;
    for (let hour = 0; hour < 24; hour++) {
        const queueSizeSamples = queueLengths.filter(x => x.dateTime >= summaryStart && getHours(x.dateTime) === hour).map(item => ({ meanValue: item.queueLength, maxValue: item.queueLength, numSamples: item.numSamples } as AggregatedSample));
        const actionCountSamples = actionDelays.filter(x => x.dateTime >= summaryStart && getHours(x.dateTime) === hour).map(item => ({ meanValue: item.numSamples, maxValue: item.actionDelayInSeconds, numSamples: item.numSamples } as AggregatedSample));
        if (actionCountSamples.length < queueSizeSamples.length) {
            for (let x = 0; x < queueSizeSamples.length - actionCountSamples.length; x++) {
                actionCountSamples.push({ maxValue: 0, meanValue: 0, numSamples: average(actionCountSamples) });
            }
        }
        const actionDelaySamples = actionDelays.filter(x => x.dateTime >= summaryStart && getHours(x.dateTime) === hour).map(item => ({ meanValue: item.actionDelayInSeconds, maxValue: item.actionDelayInSeconds, numSamples: item.numSamples } as AggregatedSample));
        timeRows.push([
            hour.toString(),
            `${numberToBlocks(average(queueSizeSamples), maxBar)} ${cappedNumber(Math.round(average(queueSizeSamples)))}`,
            `${numberToBlocks(average(actionCountSamples), maxBar)} ${cappedNumber(Math.round(average(actionCountSamples)))}`,
            secondsToFormattedDuration(average(actionDelaySamples)),
        ]);
    }

    pageContents.push({ table: { headers: timeHeadings, rows: timeRows } });

    pageContents.push({ p: "This app only reports on actions and queue lengths seen since the app was installed. Mod actions includes approve/remove actions on modqueue items only, not actions taken elsewhere. All times in UTC." });

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
        content: json2md(pageContents),
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

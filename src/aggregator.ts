import {TriggerContext} from "@devvit/public-api";
import {addDays, addHours, eachHourOfInterval, startOfDay, subWeeks} from "date-fns";
import {ACTION_DELAY_KEY, ACTION_DELAY_KEY_HOURLY, QUEUE_LENGTH_KEY, QUEUE_LENGTH_KEY_HOURLY} from "./redisHelper.js";
import {ActionDelay, QueueLength, actionDelayRedisItemToObject, queueLengthRedisItemToObject} from "./typesAndConversion.js";
import _ from "lodash";

export async function aggregateOlderData (context: TriggerContext) {
    const aggregateByHoursEndpoint = subWeeks(startOfDay(new Date()), 1);
    console.log(`Aggregator: Starting aggregation for data older than ${aggregateByHoursEndpoint.toUTCString()}`);

    const queueLengthItems = await context.redis.zRange(QUEUE_LENGTH_KEY, 0, aggregateByHoursEndpoint.getTime(), {by: "score"});
    const queueLengths = queueLengthItems.map(queueLengthRedisItemToObject);

    const actionDelayItems = await context.redis.zRange(ACTION_DELAY_KEY, 0, aggregateByHoursEndpoint.getTime(), {by: "score"});
    const actionDelays = actionDelayItems.map(actionDelayRedisItemToObject);

    const minDate = _.min([...queueLengths.map(x => x.dateTime), ...actionDelays.map(x => x.dateTime)]);

    if (!minDate) {
        console.log("Aggregator: Nothing to do.");
        return;
    }

    const slices = eachHourOfInterval({start: startOfDay(minDate), end: startOfDay(addDays(aggregateByHoursEndpoint, 1))});

    const aggregatedQueueLengths: QueueLength[] = [];
    const aggregatedActionDelays: ActionDelay[] = [];

    for (const slice of slices) {
        const queueLengthsInSlice = queueLengths.filter(x => x.dateTime >= slice && x.dateTime < addHours(slice, 1));
        if (queueLengthsInSlice.length > 0) {
            aggregatedQueueLengths.push({
                dateTime: slice,
                queueLength: _.mean(queueLengthsInSlice.map(x => x.queueLength)),
                maxQueueLength: _.max(queueLengthsInSlice.map(x => x.maxQueueLength)) ?? 0,
                numSamples: queueLengthsInSlice.length,
            });
        }

        const actionDelaysInSlice = actionDelays.filter(x => x.dateTime >= slice && x.dateTime < addHours(slice, 1));
        if (actionDelaysInSlice.length > 0) {
            aggregatedActionDelays.push({
                dateTime: slice,
                actionDelayInSeconds: _.mean(actionDelaysInSlice.map(x => x.actionDelayInSeconds)),
                maxActionDelayInSeconds: _.max(actionDelaysInSlice.map(x => x.maxActionDelayInSeconds)) ?? 0,
                numSamples: actionDelaysInSlice.length,
            });
        }
    }

    console.log(`Aggregator: Queue length samples: ${queueLengths.length} to aggregates: ${aggregatedQueueLengths.length}`);
    console.log(`Aggregator: Action delay samples: ${actionDelays.length} to aggregates: ${aggregatedActionDelays.length}`);

    for (const item of aggregatedQueueLengths) {
        // eslint-disable-next-line no-await-in-loop
        await context.redis.hset(QUEUE_LENGTH_KEY_HOURLY, {[item.dateTime.toString()]: JSON.stringify(item)});
    }

    for (const item of aggregatedActionDelays) {
        // eslint-disable-next-line no-await-in-loop
        await context.redis.hset(ACTION_DELAY_KEY_HOURLY, {[item.dateTime.toString()]: JSON.stringify(item)});
    }

    await context.redis.zRemRangeByScore(QUEUE_LENGTH_KEY, 0, aggregateByHoursEndpoint.getTime());
    await context.redis.zRemRangeByScore(ACTION_DELAY_KEY, 0, aggregateByHoursEndpoint.getTime());

    console.log("Aggregator: Completed.");
}

/*
export async function recordActionDelay (itemId: string, delayInSeconds: number, context: TriggerContext) {
    const member = `${new Date().getTime()}~${itemId}~${delayInSeconds}`;
    await context.redis.zAdd(ACTION_DELAY_KEY, {member, score: new Date().getTime()});
}

export async function recordQueueLength (queueLength: number, context: TriggerContext) {
    const now = new Date().getTime();
    await context.redis.zAdd(QUEUE_LENGTH_KEY, {member: `${now}~${queueLength}`, score: now});
}
*/

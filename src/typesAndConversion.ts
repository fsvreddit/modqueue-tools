import {ZMember} from "@devvit/public-api";
import _ from "lodash";

export interface QueueLength {
    dateTime: Date,
    queueLength: number,
    maxQueueLength: number,
    numSamples: number,
}

export interface ActionDelay {
    dateTime: Date,
    actionDelayInSeconds: number,
    maxActionDelayInSeconds: number,
    numSamples: number,
}

export interface AggregatedSample {
    meanValue: number,
    maxValue: number,
    numSamples: number
}

export function queueLengthRedisItemToObject (item: ZMember): QueueLength {
    const [, queueLength, numSamples = "1"] = item.member.split("~");
    return {
        dateTime: new Date(item.score),
        queueLength: parseFloat(queueLength),
        maxQueueLength: parseFloat(queueLength),
        numSamples: parseInt(numSamples),
    };
}

export function actionDelayRedisItemToObject (item: ZMember): ActionDelay {
    const [, , actionDelayInSeconds, numSamples = "1"] = item.member.split("~");
    return {
        dateTime: new Date(item.score),
        actionDelayInSeconds: parseFloat(actionDelayInSeconds),
        maxActionDelayInSeconds: parseFloat(actionDelayInSeconds),
        numSamples: parseInt(numSamples),
    };
}

export function average (input: AggregatedSample[]): number {
    let total = 0;
    let numSamples = 0;

    for (const item of input) {
        total += item.meanValue * item.numSamples;
        numSamples += item.numSamples;
    }

    return total / numSamples;
}

export function max (input: AggregatedSample[]): number {
    return _.max(input.map(item => item.maxValue)) ?? 0;
}

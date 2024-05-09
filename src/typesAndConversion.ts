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
    return _.sum(input.map(item => item.meanValue * item.numSamples)) / _.sum(input.map(item => item.numSamples));
}

export function max (input: AggregatedSample[]): number {
    return _.max(input.map(item => item.maxValue)) ?? 0;
}

export function aggregateObjectToQueueLength (item: string): QueueLength {
    const asObject = JSON.parse(item) as QueueLength;
    return {
        dateTime: new Date(asObject.dateTime),
        maxQueueLength: asObject.maxQueueLength,
        numSamples: asObject.numSamples,
        queueLength: asObject.queueLength,
    };
}

export function aggregateObjectToActionDelay (item: string): ActionDelay {
    const asObject = JSON.parse(item) as ActionDelay;
    return {
        dateTime: new Date(asObject.dateTime),
        actionDelayInSeconds: asObject.actionDelayInSeconds,
        numSamples: asObject.numSamples,
        maxActionDelayInSeconds: asObject.maxActionDelayInSeconds,
    };
}

import {expect, test} from "vitest";
import {AggregatedSample, average, max} from "./analyticsWikiPage.js";

test("Average", () => {
    const input: AggregatedSample[] = [
        {
            value: 1,
            numSamples: 1,
        },
        {
            value: 3,
            numSamples: 1,
        },
    ];

    const result = average(input);
    expect(result).toEqual(2);
});

test("Average with Samples", () => {
    const input: AggregatedSample[] = [
        {
            value: 1,
            numSamples: 3,
        },
        {
            value: 9,
            numSamples: 1,
        },
    ];

    const result = average(input);
    expect(result).toEqual(3);
});

test("Max", () => {
    const input: AggregatedSample[] = [
        {
            value: 1,
            numSamples: 1,
        },
        {
            value: 3,
            numSamples: 1,
        },
    ];

    const result = max(input);
    expect(result).toEqual(3);
});

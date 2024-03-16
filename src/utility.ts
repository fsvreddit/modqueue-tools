import {TriggerContext} from "@devvit/public-api";
import {FormatDurationOptions, Interval, addWeeks, differenceInSeconds, formatDuration, intervalToDuration} from "date-fns";

export enum ThingPrefix {
    Comment = "t1_",
    Account = "t2_",
    Post = "t3_",
    Message = "t4_",
    Subreddit = "t5_",
    Award = "t6_"
}

export async function getSubredditName (context: TriggerContext): Promise<string> {
    const subredditName = await context.redis.get("subredditname");
    if (subredditName) {
        return subredditName;
    }

    const subreddit = await context.reddit.getCurrentSubreddit();
    await context.redis.set("subredditname", subreddit.name, {expiration: addWeeks(new Date(), 1)});
    return subreddit.name;
}

export function formatDurationToNow (startDate: Date): string {
    const interval = <Interval>{start: startDate, end: new Date()};
    const formatDurationOptions: FormatDurationOptions = {format: ["days", "hours", "minutes", "months", "years"]};
    if (differenceInSeconds(interval.end, interval.start) < 60) {
        formatDurationOptions.format?.push("seconds");
    }

    return formatDuration(intervalToDuration(interval), formatDurationOptions);
}

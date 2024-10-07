import { TriggerContext } from "@devvit/public-api";
import { FormatDurationOptions, Interval, differenceInSeconds, formatDuration, intervalToDuration } from "date-fns";

export async function getSubredditName (context: TriggerContext): Promise<string> {
    if (context.subredditName) {
        return context.subredditName;
    }

    const subreddit = await context.reddit.getCurrentSubreddit();
    return subreddit.name;
}

export function formatDurationToNow (startDate: Date): string {
    const interval = { start: startDate, end: new Date() } as Interval;
    const formatDurationOptions: FormatDurationOptions = { format: ["days", "hours", "minutes", "months", "years"] };
    if (differenceInSeconds(interval.end, interval.start) < 60) {
        formatDurationOptions.format?.push("seconds");
    }

    return formatDuration(intervalToDuration(interval), formatDurationOptions);
}

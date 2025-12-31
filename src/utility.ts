import { FormatDurationOptions, Interval, differenceInSeconds, formatDuration, intervalToDuration } from "date-fns";

export function formatDurationToNow (startDate: Date): string {
    const interval = { start: startDate, end: new Date() } as Interval;
    const formatDurationOptions: FormatDurationOptions = { format: ["days", "hours", "minutes", "months", "years"] };
    if (differenceInSeconds(interval.end, interval.start) < 60) {
        formatDurationOptions.format?.push("seconds");
    }

    return formatDuration(intervalToDuration(interval), formatDurationOptions);
}

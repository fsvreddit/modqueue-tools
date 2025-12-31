import { Devvit } from "@devvit/public-api";
import { appSettings } from "./settings.js";
import { handleCommentReport, handleModAction, handlePostReport } from "./handleActions.js";
import { aggregateStorage, analyseQueue, buildAnalytics } from "./scheduledJobs.js";
import { onAppInstall, onAppInstallJobHandler, onAppInstallOrUpgrade } from "./installTasks.js";
import { ScheduledJob } from "./constants.js";

Devvit.addSettings(appSettings);

Devvit.addTrigger({
    event: "ModAction",
    onEvent: handleModAction,
});

Devvit.addTrigger({
    event: "PostReport",
    onEvent: handlePostReport,
});

Devvit.addTrigger({
    event: "CommentReport",
    onEvent: handleCommentReport,
});

Devvit.addSchedulerJob({
    name: ScheduledJob.AnalyseQueue,
    onRun: analyseQueue,
});

Devvit.addSchedulerJob({
    name: ScheduledJob.BuildAnalytics,
    onRun: buildAnalytics,
});

Devvit.addSchedulerJob({
    name: ScheduledJob.AggregateStorage,
    onRun: aggregateStorage,
});

Devvit.addSchedulerJob({
    name: "onInstall",
    onRun: onAppInstallJobHandler,
});

Devvit.addTrigger({
    event: "AppUpgrade",
    onEvent: onAppInstallOrUpgrade,
});

Devvit.addTrigger({
    event: "AppInstall",
    onEvent: onAppInstall,
});

Devvit.configure({
    redditAPI: true,
    http: true,
});

export default Devvit;

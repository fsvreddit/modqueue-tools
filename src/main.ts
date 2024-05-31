
import {Devvit} from "@devvit/public-api";
import {appSettings} from "./settings.js";
import {handleCommentReport, handleModAction, handlePostReport} from "./handleActions.js";
import {aggregateStorage, analyseQueue, buildAnalytics} from "./scheduledJobs.js";
import {onAppInstall, onAppInstallOrUpgrade} from "./installTasks.js";

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
    name: "analyseQueue",
    onRun: analyseQueue,
});

Devvit.addSchedulerJob({
    name: "buildAnalytics",
    onRun: buildAnalytics,
});

Devvit.addSchedulerJob({
    name: "aggregateStorage",
    onRun: aggregateStorage,
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
    redis: true,
    http: true,
});

export default Devvit;

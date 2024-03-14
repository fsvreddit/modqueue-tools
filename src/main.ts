
import {Devvit} from "@devvit/public-api";
import {appSettings} from "./settings.js";
import {handleCommentReport, handleModAction, handlePostReport} from "./handleActions.js";
import {analyseQueue, buildAnalytics} from "./scheduledJobs.js";
import {onAppInstallOrUpgrade} from "./installTasks.js";
import {refreshWikiPage} from "./analyticsWikiPage.js";

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

Devvit.addTrigger({
    events: ["AppInstall", "AppUpgrade"],
    onEvent: onAppInstallOrUpgrade,
});

Devvit.addMenuItem({
    label: "Build Analytics",
    forUserType: "moderator",
    location: "subreddit",
    onPress: async (event, context) => {
        await refreshWikiPage(context);
    },
});

Devvit.configure({
    redditAPI: true,
    redis: true,
    http: true,
});

export default Devvit;

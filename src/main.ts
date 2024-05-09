
import {Devvit} from "@devvit/public-api";
import {appSettings} from "./settings.js";
import {handleCommentReport, handleModAction, handlePostReport} from "./handleActions.js";
import {aggregateStorage, analyseQueue, buildAnalytics} from "./scheduledJobs.js";
import {onAppInstallOrUpgrade} from "./installTasks.js";
import {refreshWikiPage} from "./analyticsWikiPage.js";
import {getSubredditName} from "./utility.js";

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
    events: ["AppInstall", "AppUpgrade"],
    onEvent: onAppInstallOrUpgrade,
});

Devvit.addMenuItem({
    label: "Build Analytics",
    forUserType: "moderator",
    location: "subreddit",
    onPress: async (_, context) => {
        await refreshWikiPage(context);
        context.ui.showToast("Wiki page has been updated.");
    },
});

Devvit.configure({
    redditAPI: true,
    redis: true,
    http: true,
});

export default Devvit;

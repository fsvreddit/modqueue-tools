import {TriggerContext} from "@devvit/public-api";
import {AppInstall, AppUpgrade} from "@devvit/protos";

export async function onAppInstallOrUpgrade (_: AppInstall | AppUpgrade, context: TriggerContext) {
    const currentJobs = await context.scheduler.listJobs();
    await Promise.all(currentJobs.map(job => context.scheduler.cancelJob(job.id)));

    await context.scheduler.runJob({
        name: "analyseQueue",
        cron: "*/5 * * * *",
    });

    await context.scheduler.runJob({
        name: "buildAnalytics",
        cron: "1 0 * * *",
    });

    await context.scheduler.runJob({
        name: "aggregateStorage",
        cron: "0 5 * * *",
    });
}

import { SettingsFormField } from "@devvit/public-api";

export enum AppSetting {
    EnableAlerts = "enableAlerts",
    AlertThreshold = "alertThreshold",
    AlertAgeHours = "alertAgeHours",
    AlertThresholdForIndividualPosts = "alertThresholdForIndividualPosts",
    DiscordWebhook = "discordWebhook",
    UnderThresholdAction = "underThresholdAction",
    RoleToPing = "roleToPing",
}

export enum UnderThresholdAction {
    None = "none",
    DeleteMessage = "deleteMessage",
    UpdateMessage = "updateMessage",
}

export const appSettings: SettingsFormField[] = [
    {
        type: "group",
        label: "Alerting Options",
        fields: [
            {
                name: AppSetting.EnableAlerts,
                type: "boolean",
                label: "Enable Alerting",
                defaultValue: true,
            },
            {
                name: AppSetting.AlertThreshold,
                type: "number",
                label: "Queue size threshold",
                helpText: "Alert if the number of posts or comments in the queue is this number or higher.",
                defaultValue: 30,
                onValidate: ({ value }) => {
                    if (!value || value < 1) {
                        return "Queue size threshold must be at least 1.";
                    }
                },
            },
            {
                name: AppSetting.AlertAgeHours,
                type: "number",
                label: "Item age threshold (hours)",
                helpText: "Alert if any post or comment has been in the queue longer than this number of hours. Set to 0 to disable.",
                defaultValue: 24,
                onValidate: ({ value }) => {
                    if (value && value < 0) {
                        return "Item age threshold must be at least 0.";
                    }
                },
            },
            {
                name: AppSetting.AlertThresholdForIndividualPosts,
                type: "number",
                label: "Individual post alert threshold %",
                helpText: "If an individual post is dominating the modqueue by taking up more than this percentage of queued items, include it in the alert. Set to 0 to disable.",
                defaultValue: 40,
                onValidate: ({ value }) => {
                    if (value && value < 0) {
                        return "Individual post alert threshold age threshold must be at least 0.";
                    }
                },
            },
            {
                name: AppSetting.DiscordWebhook,
                type: "string",
                label: "Discord webhook URL",
                helpText: "The URL of the Discord webhook to send alerts to. Get this from your Discord server's settings or channel settings.",
                placeholder: "https://discord.com/api/webhooks/123456789012345678/abcdefg",
                onValidate: ({ value }) => {
                    const webhookRegex = /^https:\/\/discord(?:app)?.com\/api\/webhooks\/\d+\//;
                    if (value && !webhookRegex.test(value)) {
                        return "Please enter a valid Discord webhook URL";
                    }
                },
            },
            {
                name: AppSetting.UnderThresholdAction,
                type: "select",
                label: "Action when queue is under threshold",
                helpText: "Choose what to do with the alert message when the queue size falls below the alert threshold.",
                defaultValue: [UnderThresholdAction.None],
                options: [
                    { label: "No action (leave previous alert in place)", value: UnderThresholdAction.None },
                    { label: "Delete Alert Message", value: UnderThresholdAction.DeleteMessage },
                    { label: "Update Alert Message", value: UnderThresholdAction.UpdateMessage },
                ],
                multiSelect: false,
                onValidate: ({ value }) => {
                    if (value?.length !== 1) {
                        return "Please select one action for when the queue is under threshold.";
                    }
                },
            },
            {
                name: AppSetting.RoleToPing,
                type: "string",
                label: "Discord Role ID to ping (optional)",
                helpText: "To identify the role's ID, type \\@rolename in a channel on your server. Copy the number.",
                onValidate: ({ value }) => {
                    const roleRegex = /^\d+$/;
                    if (value && !roleRegex.test(value)) {
                        return "Please enter a valid Discord role ID";
                    }
                },
            },
        ],
    },
];

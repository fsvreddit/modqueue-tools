import {SettingsFormField} from "@devvit/public-api";

export enum AppSetting {
    EnableAlerts = "enableAlerts",
    AlertThreshold = "alertThreshold",
    AlertAgeHours = "alertAgeHours",
    AlertThresholdForIndividualPosts = "alertThresholdForIndividualPosts",
    DiscordWebhook = "discordWebhook",
    RoleToPing = "roleToPing",
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
                defaultValue: 30,
                onValidate: ({value}) => {
                    if (!value || value < 1) {
                        return "Queue size threshold must be at least 1.";
                    }
                },
            },
            {
                name: AppSetting.AlertAgeHours,
                type: "number",
                label: "Item age threshold (hours)",
                helpText: "Alert if there exists any queue items older than this. Set to 0 to disable.",
                defaultValue: 24,
                onValidate: ({value}) => {
                    if (value && value < 0) {
                        return "Item age threshold must be at least 0.";
                    }
                },
            },
            {
                name: AppSetting.AlertThresholdForIndividualPosts,
                type: "number",
                label: "Individual post alert threshold",
                helpText: "If a post's comments take up more than this percentage of the total queue, include it in the alert. Set to 0 to disable.",
                defaultValue: 40,
                onValidate: ({value}) => {
                    if (value && value < 0) {
                        return "Individual post alert threshold age threshold must be at least 0.";
                    }
                },
            },
            {
                name: AppSetting.DiscordWebhook,
                type: "string",
                label: "Discord webhook URL",
                placeholder: "https://discord.com/api/webhooks/123456789012345678/abcdefg",
                onValidate: ({value}) => {
                    const webhookRegex = /^https:\/\/discord.com\/api\/webhooks\/\d+\//;
                    if (value && !webhookRegex.test(value)) {
                        return "Please enter a valid Discord webhook URL";
                    }
                },
            },
            {
                name: AppSetting.RoleToPing,
                type: "string",
                label: "Discord Role ID to ping (optional)",
                helpText: "To identify the role's ID, type \\@rolename in a channel on your server. Copy the number.",
                onValidate: ({value}) => {
                    const roleRegex = /^\d+$/;
                    if (value && !roleRegex.test(value)) {
                        return "Please enter a valid Discord role ID";
                    }
                },
            },
        ],
    },
];

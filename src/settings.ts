import {SettingsFormField} from "@devvit/public-api";

export enum Settings {
    EnableAlerts = "enableAlerts",
    AlertThreshold = "alertThreshold",
    AlertAgeHours = "alertAgeHours",
    DiscordWebhook = "discordWebhook",
    RoleToPing = "roleToPing",
}

export const appSettings: SettingsFormField[] = [
    {
        type: "group",
        label: "Alerting Options",
        fields: [
            {
                name: Settings.EnableAlerts,
                type: "boolean",
                label: "Enable Alerting",
                defaultValue: false,
            },
            {
                name: Settings.AlertThreshold,
                type: "number",
                label: "Queue size threshold",
                defaultValue: 10,
            },
            {
                name: Settings.AlertAgeHours,
                type: "number",
                label: "Item age threshold (hours)",
                helpText: "Alert if there exists any queue items older than this",
                defaultValue: 12,
            },
            {
                name: Settings.DiscordWebhook,
                type: "string",
                label: "Discord webhook URL",
                onValidate: ({value}) => {
                    const webhookRegex = /^https:\/\/discord.com\/api\/webhooks\/\d+\//;
                    if (value && !webhookRegex.test(value)) {
                        return "Please enter a valid Discord webhook URL";
                    }
                },
            },
            {
                name: Settings.RoleToPing,
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

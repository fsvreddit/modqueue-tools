Modqueue Tools

Provides alerting and analytics for modqueues.

## Alerting

You can specify a threshold (number of queue items) and queue item age (in hours). The app will alert moderators via a Discord webhook if either the queue size is reached or a single item in the queue has been there for too long.

The app only tracks queue item age for items that were queued since the app's install, and will only alert once a day while the queue is over the threshold, but if the queue falls below the alert threshold then alerts will resume.

## Analytics

Not implemented yet.


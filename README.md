Modqueue Tools

Provides analytics and alerting for modqueues.

## Analytics

This app updates a wiki page (modqueue-tools/queuestats) on your subreddit once a day with statistics on queue lengths and queue action times for the last 24 hours and for the last three months (or the app install date, whichever is later).

## Alerting

You can specify a threshold (number of queue items) and queue item age (in hours). The app will alert moderators via a Discord webhook if either the queue size is reached or a single item in the queue has been there for too long.

The app checks the queue every 5 minutes, and will send a message if needed, but while the queue stays too large (or has too old items), further messages won't be sent until the queue is dealt with and the length is reduced, or the older items are actioned.

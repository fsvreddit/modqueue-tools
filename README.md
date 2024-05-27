Provides analytics and alerting for modqueues.

## Analytics

This app updates a wiki page (modqueue-tools/queuestats) on your subreddit once a day with statistics on queue lengths and queue action times for the last 24 hours and for the last three months (or the app install date, whichever is later).

It also includes a table with data for every day for the past 28 days.

All times are in UTC.

[Example analytics page](https://www.reddit.com/r/fsvapps/wiki/modqueue-tools/examplestats) - note this will not render properly in the Reddit mobile app.

The app will only report on queue activity after the app is installed, so to get the best out of the analytics you will need to wait a few days. The analytics page updates once a day, shortly after midnight UTC.

## Alerting

You can specify a threshold (number of queue items) and (optionally) a queue item age (in hours). The app will alert moderators via a Discord webhook if either the queue size is reached or a single item in the queue has been there for too long.

The app checks the queue every 5 minutes, and will send a message if needed, but while the queue stays too large (or has too old items), further messages won't be sent until the queue is dealt with and the length is reduced, or the older items are actioned.

You can also configure a percentage threshold for when an individual post will show in the alert.

![Example Screenshot](https://raw.githubusercontent.com/fsvreddit/modqueue-tools/main/doc_images/ModqueueAlert.png)

## About

This app is open source. You can find it on Github [here](https://github.com/fsvreddit/modqueue-tools).

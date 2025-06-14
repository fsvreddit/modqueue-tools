Provides analytics and alerting for mod queues.

## Analytics

This app updates a wiki page (modqueue-tools/queuestats) on your subreddit once a day with statistics on queue lengths and queue action times for the last 24 hours and for the last 3 months (or the app install date, whichever is later).

It also includes a table with data for each day for the past 28 days.

All times are in UTC.

[Example analytics page](https://www.reddit.com/r/fsvapps/wiki/modqueue-tools/examplestats)
**Note:** this will not render properly on the Reddit mobile app.

The app will only report on queue activity after the app is installed. To get the best out of the analytics, you will need to wait a few days. The page updates once a day, shortly after midnight UTC.

## Alerting

You can specify a threshold (number of queue items) and (optionally) a queue item age (in hours). The app will alert moderators via a Discord webhook if either the queue size is reached or a single item in the queue has been there for too long.

The app checks the queue every 5 minutes and will send a message if needed. But if the queue stays too large (or has too old items), further messages won't be sent until the queue is dealt with and the length is reduced, or the older items are actioned.

You can also configure a percentage threshold for when an individual post will show in the alert.

![Example Screenshot](https://raw.githubusercontent.com/fsvreddit/modqueue-tools/main/doc_images/ModqueueAlert.png)

A guide on how to set up a webhook can be found [here](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks).

## Source Code and Licence

This app is open source. You can find it on GitHub [here](https://github.com/fsvreddit/modqueue-tools).

## Version History

### v1.2.5

* If any stats are greater than 1000, indicate that this may be over 1000 due to limits in Reddit data retrieval
* Improve reliability of install
* Update Devvit and dependencies

### v1.2.3

* Fix problem that prevents newer Discord webhooks from being used
* Fix "1 item are over X hours old" wording

### v1.2

* Update Devvit library version only, and reformat code. No functional changes.

### v1.1

* Update Devvit library version only. No functional changes.

### v1.0.5

* Fix 3 bugs that affected subs with large queues that were present before install. It caused alerts to show inaccurate queue item age and dominant item, and show inaccurate mod action time in wiki page.
* Clarify help text on settings

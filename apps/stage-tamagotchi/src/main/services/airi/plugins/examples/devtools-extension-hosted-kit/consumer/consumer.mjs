const agentActivityKit = {
  id: 'dev.airi.agent-activity',
  version: '1.0.0',
  methods: {
    getCurrentActivity: { kind: 'method' },
  },
  events: {
    activityChanged: { kind: 'event' },
  },
}

function reactWithAiri(activity) {
  console.info('[devtools-agent-activity-consumer] AIRI reaction', activity)
}

export default {
  id: 'devtools-agent-activity-consumer',
  async setup(ctx) {
    ctx.kits.watch(agentActivityKit, (availability) => {
      console.info('[devtools-agent-activity-consumer] kit availability', {
        available: availability.available,
      })
    })

    const activityClient = await ctx.kits.use(agentActivityKit)
    ctx.subscriptions.add(
      activityClient.activityChanged.subscribe((activity) => {
        reactWithAiri(activity)
      }),
    )

    const currentActivity = await activityClient.getCurrentActivity()
    reactWithAiri(currentActivity)
  },
}

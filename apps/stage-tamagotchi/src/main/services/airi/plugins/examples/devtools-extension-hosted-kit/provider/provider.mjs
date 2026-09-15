const agentActivityKit = {
  id: 'dev.airi.agent-activity',
  version: '1.0.0',
  allowedExposePolicies: ['local-only'],
  defaultExposePolicy: 'local-only',
  methods: {
    getCurrentActivity: { kind: 'method' },
  },
  events: {
    activityChanged: { kind: 'event' },
  },
}

export default {
  id: 'devtools-agent-activity-provider',
  setup(ctx) {
    const provider = ctx.kits.provide(agentActivityKit, {
      methods: {
        getCurrentActivity(_input, call) {
          const activity = {
            agentId: 'codex',
            consumerExtensionId: call.consumerExtensionId,
            kind: 'needs-input',
            summary: 'Choose a model for the example task.',
          }
          console.info('[devtools-agent-activity-provider] current activity', activity)

          queueMicrotask(() => {
            provider.emit('activityChanged', {
              agentId: 'codex',
              consumerExtensionId: call.consumerExtensionId,
              kind: 'completed',
              summary: 'The example task is complete.',
            })
          })

          return activity
        },
      },
    })
  },
}

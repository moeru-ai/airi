const agentActivityKit = {
  id: 'dev.airi.agent-activity',
  version: '1.0.0',
  allowedExposePolicies: ['local-only'],
  defaultExposePolicy: 'local-only',
  createClient(runtime) {
    return {
      notify(input) {
        const receipt = {
          consumerExtensionId: runtime.extensionId,
          kind: input.kind,
          summary: input.summary,
        }
        console.info('[devtools-agent-activity-provider] notify', receipt)
        return receipt
      },
    }
  },
}

export default {
  id: 'devtools-agent-activity-provider',
  setup(ctx) {
    ctx.kits.provide(agentActivityKit)
  },
}

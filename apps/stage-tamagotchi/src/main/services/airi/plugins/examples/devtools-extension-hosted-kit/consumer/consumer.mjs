const agentActivityKit = {
  id: 'dev.airi.agent-activity',
  version: '1.0.0',
}

export default {
  id: 'devtools-agent-activity-consumer',
  async setup(ctx) {
    ctx.kits.watch(agentActivityKit, (availability) => {
      console.info('[devtools-agent-activity-consumer] kit availability', {
        available: availability.available,
      })
    })

    const agentActivity = await ctx.kits.use(agentActivityKit)
    const receipt = agentActivity.notify({
      kind: 'needs-input',
      summary: 'Choose a model for the example task.',
    })
    console.info('[devtools-agent-activity-consumer] receipt', receipt)
  },
}

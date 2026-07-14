function runSingleFlight(owner, key, task, options = {}) {
  const stateKey = `__request_${key}`
  const state = owner[stateKey] || { running: null, queued: null, queuedTask: null }
  owner[stateKey] = state

  if (state.running) {
    if (!options.queueLatest) return state.running

    state.queuedTask = task
    if (!state.queued) {
      state.queued = state.running
        .then(() => {
          const latestTask = state.queuedTask
          state.queuedTask = null
          return runSingleFlight(owner, key, latestTask)
        })
        .finally(() => {
          state.queued = null
        })
    }
    return state.queued
  }

  const request = Promise.resolve()
    .then(task)
    .finally(() => {
      if (state.running === request) state.running = null
    })

  state.running = request
  return request
}

module.exports = {
  runSingleFlight
}

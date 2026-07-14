function getLedgerVersion() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null
    return Number(app?.globalData?.ledgerVersion || 0)
  } catch (error) {
    return 0
  }
}

function markLedgerChanged() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null
    if (!app?.globalData) return 0
    app.globalData.ledgerVersion = getLedgerVersion() + 1
    return app.globalData.ledgerVersion
  } catch (error) {
    return 0
  }
}

module.exports = {
  getLedgerVersion,
  markLedgerChanged
}

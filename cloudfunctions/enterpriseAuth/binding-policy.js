function normalizeStatus(value) {
  return ['pending', 'approved', 'rejected'].includes(value) ? value : 'approved'
}

function resolveExistingEnterpriseBinding(existing = {}, currentOpenid = '') {
  const boundOpenid = String(existing.openid || '').trim()
  const openid = String(currentOpenid || '').trim()

  if (boundOpenid && boundOpenid !== openid) {
    return { mode: 'blocked', reason: 'bound_to_other_account' }
  }

  if (boundOpenid && boundOpenid === openid) {
    return { mode: 'same_account', nextStatus: normalizeStatus(existing.approvalStatus) }
  }

  const previousStatus = normalizeStatus(existing.approvalStatus)
  return {
    mode: 'review_required',
    nextStatus: 'pending',
    previousStatus,
    requestType: previousStatus === 'approved'
      ? 'claim_existing_enterprise'
      : 'resubmit_existing_enterprise'
  }
}

module.exports = {
  resolveExistingEnterpriseBinding
}

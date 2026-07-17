const assert = require('assert')
const { resolveExistingEnterpriseBinding } = require('../../cloudfunctions/enterpriseAuth/binding-policy')

const approvedUnbound = resolveExistingEnterpriseBinding({ approvalStatus: 'approved' }, 'new-openid')
assert.strictEqual(approvedUnbound.mode, 'review_required')
assert.strictEqual(approvedUnbound.nextStatus, 'pending')
assert.strictEqual(approvedUnbound.previousStatus, 'approved')
assert.strictEqual(approvedUnbound.requestType, 'claim_existing_enterprise')

const rejectedUnbound = resolveExistingEnterpriseBinding({ approvalStatus: 'rejected' }, 'new-openid')
assert.strictEqual(rejectedUnbound.mode, 'review_required')
assert.strictEqual(rejectedUnbound.nextStatus, 'pending')

const otherAccount = resolveExistingEnterpriseBinding({
  approvalStatus: 'approved',
  openid: 'other-openid'
}, 'new-openid')
assert.strictEqual(otherAccount.mode, 'blocked')

const sameAccount = resolveExistingEnterpriseBinding({
  approvalStatus: 'approved',
  openid: 'same-openid'
}, 'same-openid')
assert.strictEqual(sameAccount.mode, 'same_account')
assert.strictEqual(sameAccount.nextStatus, 'approved')

console.log('Enterprise binding security regression passed: 4/4')

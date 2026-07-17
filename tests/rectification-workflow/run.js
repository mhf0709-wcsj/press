const assert = require('assert')
const {
  normalizeTaskStatus,
  canSubmitRectification,
  resolveReviewDecision
} = require('../../cloudfunctions/expiryReminder/rectification-policy')

assert.strictEqual(normalizeTaskStatus('', 'unread'), 'pending')
assert.strictEqual(normalizeTaskStatus('', 'read'), 'acknowledged')
assert.strictEqual(canSubmitRectification('pending', 'unread'), true)
assert.strictEqual(canSubmitRectification('returned', 'unread'), true)
assert.strictEqual(canSubmitRectification('pending_review', 'read'), false)
assert.strictEqual(canSubmitRectification('closed', 'read'), false)
assert.deepStrictEqual(resolveReviewDecision('approved'), {
  decision: 'approved',
  nextStatus: 'closed',
  noticeStatus: 'read'
})
assert.deepStrictEqual(resolveReviewDecision('returned'), {
  decision: 'returned',
  nextStatus: 'returned',
  noticeStatus: 'unread'
})

console.log('Rectification workflow regression passed: 8/8')

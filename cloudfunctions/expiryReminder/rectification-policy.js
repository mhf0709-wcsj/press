const SUBMITTABLE_STATUSES = ['pending', 'rectifying', 'returned']

function normalizeTaskStatus(taskStatus, noticeStatus) {
  if (['pending', 'rectifying', 'pending_review', 'returned', 'closed', 'acknowledged'].includes(taskStatus)) {
    return taskStatus
  }
  return noticeStatus === 'read' ? 'acknowledged' : 'pending'
}

function canSubmitRectification(taskStatus, noticeStatus) {
  return SUBMITTABLE_STATUSES.includes(normalizeTaskStatus(taskStatus, noticeStatus))
}

function resolveReviewDecision(decision) {
  return decision === 'approved'
    ? { decision: 'approved', nextStatus: 'closed', noticeStatus: 'read' }
    : { decision: 'returned', nextStatus: 'returned', noticeStatus: 'unread' }
}

module.exports = {
  normalizeTaskStatus,
  canSubmitRectification,
  resolveReviewDecision
}

const assert = require('assert')
const fixtures = require('./fixtures.json')
const extractor = require('../../miniprogram/services/ai-extract-service')

let passed = 0

fixtures.forEach((fixture) => {
  const actual = extractor.normalizeExtractResult(fixture.model || {}, {
    text: fixture.input,
    lines: []
  })

  Object.entries(fixture.expected).forEach(([field, expected]) => {
    assert.strictEqual(
      actual[field],
      expected,
      `${fixture.name} / ${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual[field])}`
    )
  })
  passed += 1
  process.stdout.write(`PASS ${fixture.name}\n`)
})

const conflictResult = extractor.normalizeExtractResult(
  { verificationDate: '2026-09-05' },
  { text: '检定日期：2026-03-06\n有效期至：2026-09-05', lines: [] }
)
assert(conflictResult.recognitionMeta.conflictFields.includes('verificationDate'))
assert(conflictResult.recognitionMeta.lowConfidenceFields.includes('verificationDate'))
assert.strictEqual(conflictResult.recognitionMeta.fieldSources.verificationDate, '规则校正（与 AI 结果冲突）')

process.stdout.write(`\nAI extraction regression: ${passed}/${fixtures.length} fixtures passed, conflict guard passed\n`)

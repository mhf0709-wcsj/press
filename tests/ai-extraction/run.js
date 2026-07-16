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

process.stdout.write(`\nAI extraction regression: ${passed}/${fixtures.length} passed\n`)

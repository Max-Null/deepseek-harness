import { describe, expect, it } from 'vitest'
import { bm25Scores, tokenize } from '@deepseek-ai/dsh-memory-basic'

describe('tokenize', () => {
  it('keeps English runs whole and CJK ideographs as terms', () => {
    expect(tokenize('Vue3 用 <script setup>')).toEqual(['vue3', '用', 'script', 'setup'])
    expect(tokenize('中文编码规范优先')).toEqual(['中', '文', '编', '码', '规', '范', '优', '先'])
  })

  it('drops punctuation and case', () => {
    expect(tokenize('DeepSeek.V4 (Pro)!')).toEqual(['deepseek', 'v4', 'pro'])
  })
})

describe('bm25Scores', () => {
  it('scores matching documents above non-matching ones', () => {
    const docs = ['vue3 script setup preference', 'ppt compression too large', 'vue component style guide']
    const scores = bm25Scores('vue script', docs)
    expect(scores[0]).toBeGreaterThan(0)
    expect(scores[1]).toBe(0)
    expect(scores[2]).toBeGreaterThan(0)
  })

  it('returns zero for an empty corpus', () => {
    expect(bm25Scores('anything', [])).toEqual([])
  })

  it('returns zero across an empty query', () => {
    expect(bm25Scores('', ['vue3 script setup'])).toEqual([0])
  })
})

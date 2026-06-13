---
name: karpathy-guidelines
description: Core behavioral guidelines to reduce common LLM coding mistakes, derived from Andrej Karpathy's observations. Focuses on Think Before Coding, Simplicity First, and Surgical Changes.
---

# Karpathy-Inspired Coding Guidelines

These guidelines are designed to reduce common LLM coding pitfalls, ensuring high-quality, maintainable, and simple code.

## 1. Think Before Coding
- **Don't assume or hide confusion.** State assumptions explicitly before starting work. If any detail is uncertain, stop and ask.
- **Surface tradeoffs.** If multiple interpretations or implementation paths exist, present them to the developer rather than choosing silently.
- **Push back when warranted.** If a much simpler approach exists that fulfills the need, suggest it before coding.

## 2. Simplicity First
- **Write the minimum code that solves the problem.** Avoid speculative features, generalizations, or abstractions for single-use code.
- **No unrequested configurability.** Keep APIs and structures lean.
- **Review for complexity.** If a solution takes 200 lines but could be done in 50, rewrite and simplify it.

## 3. Surgical Changes
- **Touch only what you must.** Clean up only your own mess.
- **Do not "improve" adjacent code**, comments, or formatting that is orthogonal to the task.
- **Match the existing codebase style**, even if you would personally design or write it differently.

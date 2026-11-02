---
name: wedding-invitations
description: 'Use when user says "make a wedding invitation", "design a save-the-date", "create an RSVP card", or "place cards for our wedding". Designs a bespoke invitation as HTML rendered to a print-ready PNG.'
allowed-tools: Bash(chromium:*), Bash(google-chrome:*), Bash(microsoft-edge:*), Bash(node:*), Bash(git:*)
category: event-design
---

# Wedding Invitations, bespoke, local, multilingual

[`wyx-sg/wedding-invitation-skill`](https://github.com/wyx-sg/wedding-invitation-skill), designs a one-off wedding invitation from a conversation. Outputs a print-ready PNG (1080×1440 portrait or 1080×1920 9:16 poster). Renders locally via a headless Chromium browser; no uploads, no cloud, no telemetry.

## When to use
- "Help me make a wedding invitation"
- "Design a save-the-date in [language]"
- Save-the-dates, RSVP cards, programs, menus, place cards, anything the same HTML→PNG pipeline can produce
- Multilingual collateral (English, Chinese, Spanish, Japanese, Korean, or any combination)
- Aesthetic directions covered by the upstream gallery: new-chinese, wabi-sabi, art-deco, morandi, modern-minimal, mediterranean, retro-poster, etc.

## How
1. **Talk**, the skill asks for language(s), names, date, venue, style preference
2. **Preview**, aesthetic directions shown visually in your browser
3. **Design**, Claude writes a unique HTML template from scratch
4. **Iterate**, natural-language tweaks ("bigger font" / "softer color" / "swap the photo")
5. **Export**, one command screenshots the HTML → high-res PNG

## Install
```bash
git clone https://github.com/wyx-sg/wedding-invitation-skill \
  ~/.claude/skills/wedding-invitation
```
Then invoke via `/wedding-invitation` in Claude Code, or just ask: "help me make a wedding invitation."

## Prerequisites
- `node` 18+
- A Chromium-family browser: `chromium`, `google-chrome`, or `microsoft-edge` (any one suffices)
- `git` for the install

The upstream `render.js` auto-locates whichever browser you have. On Linux: `cue cli install chromium`. On macOS: `brew install --cask chromium` (or any Chrome already installed works). On Windows: Edge ships with the OS.

## Notes
- **Privacy**: photos, names, addresses stay on your machine. The only network requests are Google Fonts CDN loads from your browser during HTML preview, font URLs only, nothing about you.
- **Not a template gallery**: each invitation is designed fresh from your prompt. The 20 gallery examples are showcases, not picks.
- **Other agents**: the skill is Claude-Code-first but works with Codex CLI, Cursor, Aider, Gemini CLI, tell the agent "read SKILL.md and help me make a wedding invitation."
- **Sibling collateral**: this skill specializes in invitations but the HTML→PNG pipeline generalizes, for programs/menus/place cards, the same workflow applies; ask Claude to adapt the template.

# OpenClaw UI Overhaul Design

## Overview

Three major enhancements to OpenClaw Control UI:

1. Session switch stream buffering (fix data loss)
2. Professional UI polish (competitive parity with ChatGPT/Claude)
3. "木火通明" (Mùhuǒ Tōngmíng) custom theme

## 1. Session Switch Stream Buffering

### Problem

Switching sessions during active streaming clears `chatStream` and `chatRunId`, losing in-progress AI responses.

### Solution: Per-Session Stream Buffer

- `Map<sessionKey, SessionStreamState>` stores stream state per session
- On switch away: save current stream state to buffer
- Background: WebSocket events route to buffer by sessionKey
- On switch back: restore stream state, continue display

### Files Modified

- `ui/src/ui/app.ts` — add `sessionStreamBuffers` state
- `ui/src/ui/app-render.helpers.ts` — save/restore in `resetChatStateForSessionSwitch`
- `ui/src/ui/controllers/chat.ts` — route background events to buffer

## 2. UI Enhancements

### Message Styling

- User messages: right-aligned with tinted background
- AI messages: left-aligned card style with avatar
- Streaming cursor: blinking `|` at end of AI response

### Loading & Status

- Three-dot bounce animation for AI thinking
- Connection health pulse indicator in topbar
- Smooth page transitions (fade-in, stagger)

### Session Sidebar

- Search/filter input at top
- Session count badge

### Mobile

- Larger touch targets (44px minimum)
- Swipe gesture for sidebar toggle

## 3. 木火通明 Theme

### Color Palette

| Token      | Light   | Dark    |
| ---------- | ------- | ------- |
| accent     | #2E7D32 | #4CAF50 |
| secondary  | #E65100 | #FF6D00 |
| highlight  | #F9A825 | #F9A825 |
| bg         | #F1F8E9 | #1A2E1A |
| surface    | #E8F5E9 | #1E3A1E |
| text       | #1B5E20 | #E8F5E9 |
| text-muted | #558B2F | #A5D6A7 |
| border     | #C8E6C9 | #2E5A2E |
| ok         | #2E7D32 | #4CAF50 |
| warn       | #E65100 | #FF6D00 |
| danger     | #BF360C | #FF3D00 |

### Forbidden Colors

No blue, black, or dark gray (水气 — water element conflicts with fire).

- `--info` blue → emerald green
- Black text → deep emerald #1B5E20
- Gray backgrounds → forest green #1A2E1A

### Implementation

- New ThemeMode: `"muhuotongming"`
- CSS: `[data-theme="muhuotongming-light"]` and `[data-theme="muhuotongming-dark"]`
- Follows system light/dark preference within the theme
- Set as default theme (localStorage empty → muhuotongming)
- Fourth theme button in topbar: 🔥

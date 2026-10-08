# Townwatch design notes

**Design read**: an editorial civic briefing for residents of small rural places (including older
and low-literacy readers) and for hackathon judges, in a trust-first local-press language, built
with native CSS, a newspaper serif for headlines and a civic sans for reading.

**Dials** (design-taste-frontend): variance 5, motion 2, density 4. Reading comes first; nothing
moves on its own; hover and focus states only.

## Type
- Headlines: Playfair Display 700/800. Serif justified: the product is a local newspaper page.
- Reading text: Public Sans (the typeface of the US Web Design System), 19px / 1.55, measure 66ch.
- Small text never below 15px. Item numbers and dates use tabular figures.
- Emphasis inside a headline uses the same family (bold or italic), never a second family.

## Colour (one accent, locked)
| Token | Light | Dark |
|---|---|---|
| `--paper` | `#fafaf8` | `#121417` |
| `--ink` | `#16181d` | `#ecebe6` |
| `--ink-2` (secondary text) | `#4a4f59` | `#b4b7bd` |
| `--rule` (hairlines) | `#d9d9d4` | `#2c3036` |
| `--accent` (brick red: links, kicker) | `#a8232c` | `#f0858b` |
Contrast checked against `--paper` in both themes (AA for body, AAA for headlines).

## Shape and rhythm
- Corner radius 0 everywhere (newspaper): buttons, inputs, panels.
- Spacing scale 4, 8, 12, 16, 24, 32, 48, 72 px (borrowed rhythm from editorial references,
  not their identity).
- Sections are separated by a 1px ink rule or a hairline, never by cards with shadows.
- Display line-height 1.05; body 1.55.

## Content rules (from the constitution)
- Every sentence of a briefing carries its citation inline: document link, item number, page.
- Missing values read "not stated in the record".
- Disclaimer on every briefing: automatic summary, the official record prevails.
- No emojis, no dashes in our own copy (record text stays verbatim), no AI wording, no
  stock photos (a generic photo next to a civic record would mislead).
- Icons: Phosphor, regular weight, one family.

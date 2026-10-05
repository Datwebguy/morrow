# 90-second screen recording

One full case, start to end: the closure, the weekend move, the projected margin call, the action, the reopen and the grade.

This case is a **simulated loan on real Bitget prices** for the closure from Friday 25 September to Monday 28 September 2026. Nothing in it is a real user. Keep the words "Simulated loan. Real prices." on screen the whole time. The full log is in `docs/closure-dry-run-RARMUSDT-2026-09-28.md`; every number below comes from it.

If you have connected a real loan by the time you record, record that instead and use the same beats with your own numbers.

## Setup before recording

- Light theme, 1280 by 800 browser window, no other tabs.
- Open `docs/closure-dry-run-RARMUSDT-2026-09-28.md` rendered on GitHub in one tab and https://themorrow.vercel.app in another.

## Script

| Time | On screen | Voice |
|---|---|---|
| 0:00 to 0:08 | The home page hero. | "Borrow against your stocks on Bitget, and a weekend can decide whether you keep them. Morrow makes sure you do." |
| 0:08 to 0:20 | Scroll to How it works, then Your controls. | "It watches your loan, projects what Monday's reopen does to it, and only ever pays down or adds backing. It never sells, borrows or withdraws, and you set the limits." |
| 0:20 to 0:32 | The log: closure line and simulated loan line. | "Here is one real closure. The US market closed Friday at 20:00 UTC. This is a simulated 10,000 USDT loan on the stock token rARM, starting at 70 percent loan health. Bitget's margin-call level is 75." |
| 0:32 to 0:46 | The log: the pay-down row, then the promise line. | "Two hours before the close, Morrow projected this loan at 74.5 percent, right at the margin-call level. It paid down 896 USDT, a preview only, to bring it back under, and sealed its promise with a public fingerprint." |
| 0:46 to 1:00 | The log: the lines through the weekend. | "Over the weekend the price drifted lower. Morrow checked every hour, and any price it relied on had to pass its trust checks first." |
| 1:00 to 1:15 | The log: the reopen and grade lines. | "Monday, the US market reopened 7.8 percent lower. Thirty minutes after the open, Morrow graded itself. Loan health was 66 percent." |
| 1:15 to 1:25 | The grade line: "with no action it would have been 75.9% (a margin call)". | "With no action it would have been 75.9 percent. A margin call. Promise kept." |
| 1:25 to 1:30 | The record page. | "Every real promise lands on the public record. Morrow. Borrow today. Still yours tomorrow." |

## Say this honestly if asked

- The loan in this recording is simulated, on real prices. The live record starts with the first real protected closure.
- The history replay is a test over about nine months, not a promise of results. Read `docs/METHOD.md` for how it was made and what it does not show.

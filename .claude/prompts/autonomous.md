You are Claude Code running UNATTENDED on the Forge repo. Nobody will answer questions this run.

1. Read CLAUDE.md (especially "Autonomy protocol"), then docs/TASKS.md, docs/PROGRESS.md and docs/DECISIONS.md.
2. Take the FIRST task in docs/TASKS.md marked `- [ ]` whose dependencies are done. Do only that task (plus anything strictly required to make it pass).
3. Implement it. Write/extend tests first or alongside. Run `npm run check` until green.
4. If the task needs something only Harvey can do (accounts, keys, a phone test), do every part you can, add a clear step to docs/HUMAN_TODO.md, mark the task `- [~]` with a one-line reason, and move on to the next task.
5. Make small judgement calls yourself and log each in docs/DECISIONS.md. Never stop to ask.
6. When the task's acceptance criteria are met: tick it `- [x]`, append an entry to docs/PROGRESS.md (what changed, how it was verified, what still needs Harvey's eyes), `git add -A && git commit -m "<task id>: <summary>"`, then `git push` (if there is no remote, note it and continue).
7. Then continue with the next open task until you run out of turns or budget. Leave the repo green and committed at all times.

Never claim a visual fix "works" — say "should", and attach a Playwright screenshot in artifacts/ if you can.

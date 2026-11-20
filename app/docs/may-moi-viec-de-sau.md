# Mây mới: việc nhỏ để sau

Các điểm nhỏ người rà soát ghi lại trong lúc làm Mây mới (20/11/2026), chưa sửa vì không chặn deploy. Ghi nguyên văn từ sổ theo dõi (tiếng Anh).

- Task 1: minor (deferred): idempotence test does not cover `create index` without `if not exists`
- Task 1: minor (deferred): no seed row isolates FAMILY_PLAN steps for new tables
- Task 1: minor (deferred): chat.test.ts flaked once in a parallel full run (unrelated, unverified)
- Task 2: minor (deferred): name-before-role precedence ("bố An" → An; "con rể/con mèo" → only child)
- Task 2: minor (deferred): English names use last word as given name (fails safe)
- Task 2: minor (deferred): extractSoon 'skip' never reschedules → late answer not extracted
- Task 2: minor (deferred): backfill can grab a just-finished call before afterCall (add done_at < now()-10min); thrown error stops run until reboot
- Task 2: minor (deferred): no transaction around unreplace/clear/insert/done
- Task 2: minor (deferred): extractCall doesn't check hasAI() → burns tries without key
- Task 2: minor (deferred): past upcoming date rolls to next year, sits 12 months
- Task 2: minor (deferred): DRY whole-word check + pad duplicated; tests lack 24h window/extractSoon; seed topic 'hoi-tham' not in TOPICS yet; test output noise ([memory] warnings, [ai] 500)
- Task 2: minor (deferred): LANG_NAME/cleanLine copied (move to shared module later)
- Task 3: minor (deferred): question-shaped reaction joined on check-in turn can give two questions in a row
- Task 3: minor (deferred): DRY pairOf/hasPair/themesFor (Task 6 rewrites scriptFacts)
- Task 3: minor (deferred): test gaps (template rotation/asked filter, aiScript wedding-not-allowed, storyPlan v2 filter, episodeIdxOf parse error, /share route)
- Task 3: minor (deferred): call.test.ts:226 shadows `both`
- Task 4: minor (deferred): 3s /reply race spends 2 lines (add one sentence to docs)
- Task 4: minor (deferred): one-person family never shares (product question for user)
- Task 4: minor (deferred): DRY askShare≈askPhoto, normalizer/mic duplicated (brief mandated "built like askPhoto")
- Task 4: minor (deferred): test gaps (heard '' → wait, think timeout, tap during think; assert 'no' for 안돼요); Call.tsx no harness
- Task 4: minor (deferred): "ừ sao không chia sẻ" mid-sentence now reads 'no' (fails safe, button still shares)
- Task 5: minor (deferred): prompt TRIAL CALL clause untested; /call/start insert + /call/due SQL untested (need DB)
- Task 5: minor (deferred): push.ts weeklyTick still withholds Saturday push from members < 24 h old (card unaffected) — decide keep+document or remove
- Task 5: minor (deferred): MayTab gets callDue without callTrial (check if MayTab shows weekly wording to trial users)
- Task 6: minor (deferred): used facts marked even when AI lines swapped for template; holidays local vs today/events VN time; stale local_time/weather in a reused script; OWN_STORY guard drops attributed memory lines (Korean loses most); hour12 in haystack when place unknown; topicMap tie/old-call depth; weatherCache never evicts; placeOfMember own nearest loop, dup pad/Db; test gaps (context failure, /call/start marking, weather non-ok/timeout, hours_apart omission)
- Task 6: minor (deferred): no test that reused path skips the extras loader (route bound to pool + limiter); extras load has no overall cap
- Task 7: minor (deferred): connectedIn returns Room.up which only grows (late joiner marks contact with someone who hung up; pitch numbers slightly inflated; plan-mandated); nudge rows count toward caps/pitch "sent" even with no push subscription; markCallContact union untested; en/ko nudge copy needs a native read
- Task 7: minor (deferred): oneAtATime has no timeout (a never-settling tick skips all later ticks)
- Task 8: minor (ĐÃ SỬA ở 830a2b6): saveDates (call.ts ~898-935) writes AI event titles/notes from every call into the shared family calendar, ignoring calls.shared — a declined story can surface as a calendar note (pre-existing, not in any brief)
- Task 8: minor (deferred): shareCall partial failure unrecoverable ('and not shared' + queueTell throw → notices/topic rebuild lost; wrap in a transaction or rely on unique index); render could read calls.shared at insert (hardening); role words in prose narrow recipients (bố/mẹ of teller's own parents, "ba"=three, "con" classifier); re-extraction overlapping a share leaves facts self (safe side); test gaps for vault/photos/buildTopic/coverFor/share-route 404 SQL; storyOf regex duplicated in photos route; tellStory vs shareCall recipient text differs; podcast: open while sheet open keeps selection
- Task 9: minor (deferred): already-built script may still speak a deleted fact; HANDOFF line ~39 stale "Mây mới ... Chưa làm code"; HANDOFF column list omits calls.trial; MayMemory double-tap revert uses !v; no loading/expand cue
- Final fix: minor (deferred): stale /share vs /keep race after reload; MayMemory out-of-order PUT; ko child→parent nudge over-polite toward child (pre-existing); boot log line only when N>0

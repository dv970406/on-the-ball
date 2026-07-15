-- =====================================================================
-- 온더볼 (On the Ball) — 시드 데이터
--
-- 프로토타입(design_handoff_ontheball/prototype/app/*.jsx)의 목데이터를
-- 그대로 옮긴다. 1회 적용 전제 (on conflict 없음).
--  * 밸런스 4건 / 랭킹 1건 / 유니폼 1건 / TMI 5건 → polls + poll_options
--  * 시드 댓글 → comments (user_id null, display_* 비정규화 필드 사용)
--  * 오늘의 퀴즈 + 예정 2건 + 지난 4건 → lineups / quizzes / quiz_choices
--  * 뱃지 7종 (프로토타입 6종 + RPC가 참조하는 first-vote)
--  * 연령대·지역 시드 통계 → poll_demographics
--  * 홈 트렌딩 5건 → trending_items
-- =====================================================================

-- ========== polls ==========
-- 밸런스 4건: screen-balance.jsx BALANCE_DATA (position = 홈 캐러셀 순서)
-- 마감: 프로토타입 D-N 표기를 now() + N days 로 환산
insert into public.polls (id, type, title, subtitle, tag, closes_at, featured, position, meta) values
  -- goat: 홈 히어로 카피(screen-home.jsx featured)가 상세 title과 달라 meta.hero 에 보존
  ('goat', 'balance', '평생 한 팀의 감독으로 데려간다면?', '메시 한 명 vs 호날두 한 명. 영혼을 걸어야 해요.', 'GOAT',
   now() + interval '8 days', true, 0,
   '{"hero": {"title": "둘 중 한 명만 데려간다면?", "sub": "평생 한 팀의 감독으로 — 8일 남음", "aSub": "GOAT, 좌발", "bSub": "GOAT, 우발"}}'::jsonb),
  ('mbappe-haaland', 'balance', '리그 한 시즌만 우리 팀 영입', '내년 시즌 단 한 명, 누구를 데려올까?', 'EPL vs LaLiga',
   now() + interval '3 days', false, 1, '{}'::jsonb),
  -- 홈 미니 카드의 라벨/태그가 옵션 label과 달라 meta.card 에 보존
  ('sangam-westham', 'balance', '11 vs 11, 90분이면 누가 이길까?', '상암 동네 조기축구 vs EPL 하위권 풀스쿼드', '스쿼드 대결',
   now() + interval '12 days', false, 2,
   '{"card": {"tag": "스쿼드", "a": "상암 11명", "b": "웨스트햄 11명"}}'::jsonb),
  ('kit-vs', 'balance', '25/26 더 예쁜 홈 유니폼은?', '디자인만 가지고 골라봐.', '유니폼',
   now() + interval '5 days', false, 3,
   '{"card": {"a": "맨유 25/26", "b": "아스널 25/26"}}'::jsonb);

-- 랭킹 1건: screen-ranking.jsx RANKING_DATA
insert into public.polls (id, type, title, subtitle, tag, closes_at, featured, position, meta) values
  ('ballon-2026', 'ranking', '올해 발롱도르, 1위는?', '한 명만 골라요. 결과는 투표 즉시 공개돼요.', 'Ballon d''Or',
   now() + interval '8 days', false, 0, '{"cover": "trophy"}'::jsonb);

-- 유니폼 1건: screen-ranking.jsx KIT_DATA (홈 카드 제목이 상세 title과 달라 meta.card 에 보존)
insert into public.polls (id, type, title, subtitle, tag, closes_at, featured, position, meta) values
  ('kit-2526', 'kit', '25/26 시즌 가장 예쁜 홈 유니폼', '디자인만 봐요. 클럽 호불호 잠시 내려놓고.', '유니폼',
   now() + interval '5 days', false, 0,
   '{"cover": "kit", "card": {"title": "25/26 시즌 가장 예쁜 유니폼"}}'::jsonb);

-- TMI 5건: screen-tmi.jsx TMI_DECK (title = 카드의 주장, position = 덱 순서)
insert into public.polls (id, type, title, subtitle, tag, closes_at, featured, position, meta) values
  ('tmi-son', 'tmi', '경기 전 정확히 같은 음식을 12년째 먹고 있다.', null, 'TMI', null, false, 0,
   '{"player": "손흥민", "club": "Tottenham", "flag": "KR", "detail": "아버지 손웅정 코치가 직접 정한 식단이라는 설"}'::jsonb),
  ('tmi-haaland', 'tmi', '시즌 중에는 매일 새벽 4시 30분에 일어난다.', null, 'TMI', null, false, 1,
   '{"player": "홀란드", "club": "Man City", "flag": "NO", "detail": "명상 → 안약 → 단백질 음료 → 가벼운 산책 루틴"}'::jsonb),
  ('tmi-bellingham', 'tmi', '드레싱룸에서 가장 노래를 잘 부른다고 인정받았다.', null, 'TMI', null, false, 2,
   '{"player": "벨링엄", "club": "Real Madrid", "flag": "EN", "detail": "루카 모드리치가 비공식 평가위원장이라는 주장"}'::jsonb),
  ('tmi-mbappe', 'tmi', '라리가 선수 절반 이름을 아직 외우지 못한다.', null, 'TMI', null, false, 3,
   '{"player": "음바페", "club": "Real Madrid", "flag": "FR", "detail": "익명의 동료 인터뷰 — 본인은 부인"}'::jsonb),
  ('tmi-degea', 'tmi', '맨유 시절 컨디션에 따라 GK 장갑 색을 바꿨다.', null, 'TMI', null, false, 4,
   '{"player": "데헤아", "club": "은퇴", "flag": "ES", "detail": "7가지 색을 로테이션. 평일 빨강, 빅매치는 검정"}'::jsonb);

-- ========== poll_options ==========
-- 밸런스: side a/b — tone/text/accent/stats/blurb 는 프로토타입 값 그대로
insert into public.poll_options (id, poll_id, position, label, sublabel, seed_votes, meta) values
  ('goat:a', 'goat', 0, '메시', 'L. Messi', 16284,
   '{"side": "a", "metaLine": "37 · LW · 좌발", "tone": "#0a0a0a", "text": "#fff", "accent": "var(--primary)", "stats": [["통산 골", "850+"], ["발롱도르", "8회"], ["우승컵", "46개"]], "blurb": "왼발로 시간을 멈춘다. 패스, 드리블, 마무리 — 한 발에 다 들어 있음."}'::jsonb),
  ('goat:b', 'goat', 1, '호날두', 'C. Ronaldo', 12128,
   '{"side": "b", "metaLine": "40 · ST · 우발", "tone": "#fff", "text": "#171717", "accent": "var(--accent-crimson)", "stats": [["통산 골", "900+"], ["발롱도르", "5회"], ["우승컵", "34개"]], "blurb": "점프와 자기 통제의 끝판왕. 마흔에도 골을 넣고 있다."}'::jsonb),
  ('mbappe-haaland:a', 'mbappe-haaland', 0, '음바페', 'K. Mbappé', 5021,
   '{"side": "a", "metaLine": "26 · LW · 우발", "tone": "#1c1c1c", "text": "#fff", "accent": null, "stats": [["지난 시즌 골", "44"], ["도움", "11"], ["평점", "8.4"]], "blurb": "단거리는 그가 가장 빠르다. 결정적 순간의 차분함."}'::jsonb),
  ('mbappe-haaland:b', 'mbappe-haaland', 1, '홀란드', 'E. Haaland', 4091,
   '{"side": "b", "metaLine": "24 · ST · 양발", "tone": "#fafafa", "text": "#171717", "accent": null, "stats": [["지난 시즌 골", "52"], ["도움", "9"], ["평점", "8.1"]], "blurb": "박스 안의 짐승. 한 시즌 60골 도전 중."}'::jsonb),
  ('sangam-westham:a', 'sangam-westham', 0, '상암 동호회', 'Sangam FC', 2412,
   '{"side": "a", "metaLine": "평균 38세 · 한국", "tone": "#0047a0", "text": "#fff", "accent": null, "stats": [["평균 연령", "38"], ["역사", "12년"], ["주말마다", "출석"]], "blurb": "한 명도 안빠지는 출석률. 골키퍼 친구가 좀 잘 막음."}'::jsonb),
  ('sangam-westham:b', 'sangam-westham', 1, '웨스트햄', 'West Ham U.', 1809,
   '{"side": "b", "metaLine": "EPL · 잉글랜드", "tone": "#7a263a", "text": "#fff", "accent": null, "stats": [["리그 순위", "13위"], ["평균 연령", "27"], ["연봉", "다름"]], "blurb": "아무리 못해도 EPL은 EPL이다. 근데 운동장은 진흙이에요."}'::jsonb),
  ('kit-vs:a', 'kit-vs', 0, '맨유', 'Manchester Utd.', 3098,
   '{"side": "a", "metaLine": "홈 · 25/26", "tone": "#da291c", "text": "#fff", "accent": null, "stats": [["컬러", "클래식 레드"], ["패턴", "삼바 텍스처"], ["스폰서", "snap."]], "blurb": "오랜만에 단정한 디자인. 칼라가 호불호."}'::jsonb),
  ('kit-vs:b', 'kit-vs', 1, '아스널', 'Arsenal FC', 3011,
   '{"side": "b", "metaLine": "홈 · 25/26", "tone": "#ef0107", "text": "#fff", "accent": null, "stats": [["컬러", "EF0107 레드"], ["패턴", "퍼지 그라데이션"], ["스폰서", "Emirates"]], "blurb": "소매 트림이 화이트 풀+체크. 90년대 향수."}'::jsonb);

-- 랭킹 후보 6명: label=이름, sublabel=클럽, seed_votes=count (합 24,891)
insert into public.poll_options (id, poll_id, position, label, sublabel, seed_votes, meta) values
  ('ballon-2026:mbappe',     'ballon-2026', 0, '음바페',     'Real Madrid', 8214, '{"flag": "FR", "hue": 220}'::jsonb),
  ('ballon-2026:haaland',    'ballon-2026', 1, '홀란드',     'Man City',    5612, '{"flag": "NO", "hue": 200}'::jsonb),
  ('ballon-2026:bellingham', 'ballon-2026', 2, '벨링엄',     'Real Madrid', 4498, '{"flag": "EN", "hue": 60}'::jsonb),
  ('ballon-2026:rodri',      'ballon-2026', 3, '로드리',     'Man City',    3120, '{"flag": "ES", "hue": 30}'::jsonb),
  ('ballon-2026:vinicius',   'ballon-2026', 4, '비니시우스', 'Real Madrid', 2018, '{"flag": "BR", "hue": 120}'::jsonb),
  ('ballon-2026:palmer',     'ballon-2026', 5, '팔머',       'Chelsea',     1429, '{"flag": "EN", "hue": 280}'::jsonb);

-- 유니폼 6벌: label=클럽명, seed_votes=votes (합 8,214)
insert into public.poll_options (id, poll_id, position, label, sublabel, seed_votes, meta) values
  ('kit-2526:mu',  'kit-2526', 0, '맨유',   null, 1844, '{"tone": "#da291c", "stripe": null,   "dark": false}'::jsonb),
  ('kit-2526:ars', 'kit-2526', 1, '아스널', null, 2110, '{"tone": "#ef0107", "stripe": "sash", "dark": false}'::jsonb),
  ('kit-2526:liv', 'kit-2526', 2, '리버풀', null, 1392, '{"tone": "#c8102e", "stripe": null,   "dark": false}'::jsonb),
  ('kit-2526:chl', 'kit-2526', 3, '첼시',   null, 1102, '{"tone": "#034694", "stripe": "h",    "dark": false}'::jsonb),
  ('kit-2526:mci', 'kit-2526', 4, '맨시티', null,  892, '{"tone": "#6cabdd", "stripe": null,   "dark": false}'::jsonb),
  ('kit-2526:tot', 'kit-2526', 5, '토트넘', null,  874, '{"tone": "#ffffff", "stripe": "h",    "dark": true}'::jsonb);

-- TMI 진실/거짓: seed_votes = round(n × truePct/100) / n − true (합이 n과 정확히 일치)
insert into public.poll_options (id, poll_id, position, label, sublabel, seed_votes, meta) values
  -- 손흥민: n 4,421 · 진실 78%
  ('tmi-son:true',         'tmi-son',        0, '진실', null, 3448, '{"verdict": "true"}'::jsonb),
  ('tmi-son:false',        'tmi-son',        1, '거짓', null,  973, '{"verdict": "false"}'::jsonb),
  -- 홀란드: n 3,812 · 진실 64%
  ('tmi-haaland:true',     'tmi-haaland',    0, '진실', null, 2440, '{"verdict": "true"}'::jsonb),
  ('tmi-haaland:false',    'tmi-haaland',    1, '거짓', null, 1372, '{"verdict": "false"}'::jsonb),
  -- 벨링엄: n 2,103 · 진실 51%
  ('tmi-bellingham:true',  'tmi-bellingham', 0, '진실', null, 1073, '{"verdict": "true"}'::jsonb),
  ('tmi-bellingham:false', 'tmi-bellingham', 1, '거짓', null, 1030, '{"verdict": "false"}'::jsonb),
  -- 음바페: n 5,612 · 진실 22%
  ('tmi-mbappe:true',      'tmi-mbappe',     0, '진실', null, 1235, '{"verdict": "true"}'::jsonb),
  ('tmi-mbappe:false',     'tmi-mbappe',     1, '거짓', null, 4377, '{"verdict": "false"}'::jsonb),
  -- 데헤아: n 1,842 · 진실 71%
  ('tmi-degea:true',       'tmi-degea',      0, '진실', null, 1308, '{"verdict": "true"}'::jsonb),
  ('tmi-degea:false',      'tmi-degea',      1, '거짓', null,  534, '{"verdict": "false"}'::jsonb);

-- ========== comments (시드 댓글 — user_id null) ==========
-- created_at 은 프로토타입 time 표기('N분 전')를 now() 기준으로 환산
insert into public.comments (poll_id, user_id, display_name, display_tag, body, seed_likes, created_at) values
  ('goat', null, '북런던러버', '아스널 팬', '메시. 한 발에 다 끝나는 선수는 메시밖에 없다.', 67, now() - interval '8 minutes'),
  ('goat', null, 'CR7Forever', '맨유 팬',   '40에 뛰는 선수가 이긴다. 자기관리=실력',        42, now() - interval '14 minutes'),
  ('goat', null, '한남동소령', '토트넘 팬', '둘 다 데려가면 안되나요...',                    21, now() - interval '32 minutes'),
  ('goat', null, 'TT',         null,        '메시는 시 같은 축구를 함. 호날두는 산업',       88, now() - interval '1 hour'),
  ('mbappe-haaland', null, '치킨먹는하스', '맨시티 팬', '득점왕은 홀란드인 듯',        12, now() - interval '5 minutes'),
  ('mbappe-haaland', null, '빠리지엔',     null,        '음바페는 시즌 통째로 다 함',   9, now() - interval '20 minutes'),
  ('sangam-westham', null, '동네축구왕',   null,        '운동장이 진흙이면 상암이 이긴다', 31, now() - interval '1 hour'),
  ('kit-vs',         null, '북런던러버',   '아스널 팬', '소매 디테일 진짜 미쳤다',      18, now() - interval '7 minutes');

-- ========== lineups ==========
-- screen-quiz.jsx QUIZ_DATA formation (GK줄부터 4줄 11셀)
insert into public.lineups (id, formation, caption, rows) values
  ('rm-1718', '4-3-3', '4-3-3 · 11 caps · 7 nations',
   '[[{"pos": "GK", "flag": "BE"}], [{"pos": "LB", "flag": "BR"}, {"pos": "CB", "flag": "FR"}, {"pos": "CB", "flag": "ES"}, {"pos": "RB", "flag": "PT"}], [{"pos": "LM", "flag": "DE"}, {"pos": "CM", "flag": "HR"}, {"pos": "RM", "flag": "BR"}], [{"pos": "LW", "flag": "PT"}, {"pos": "ST", "flag": "FR"}, {"pos": "RW", "flag": "ES"}]]'::jsonb);

-- ========== quizzes ==========
-- 오늘의 문제 (QUIZ_DATA)
insert into public.quizzes (id, kind, title, subtitle, hint, answer_text, lineup_id, opens_on) values
  ('lineup-rm-1718', '라인업', '국적만 보고 맞춰봐. 어느 팀의 어느 시즌?', '4-3-3. 챔피언스 리그 결승 선발 11명.',
   'CM은 골든볼 받았던 미드필더예요. 양쪽 윙은 같은 반도 출신.',
   'Real Madrid · 2017/18 UCL 결승 선발 11명', 'rm-1718', current_date);

-- 예정된 문제 2건 (QuizListScreen upcoming — 잠금 상태, 예상 정답률은 subtitle 에 보존)
insert into public.quizzes (id, kind, title, subtitle, hint, answer_text, lineup_id, opens_on) values
  ('legend-video-30s',        '레전드', '경기 영상 30초로 시즌 맞히기', '예상 정답률 19%', null, null, null, current_date + 1),
  ('tmi-bellingham-nickname', 'TMI',    '벨링엄의 진짜 별명은?',        '예상 정답률 44%', null, null, null, current_date + 2);

-- 지난 문제 4건 (QuizListScreen past — quiz_stats 뷰가 프로토타입 정답률·도전자수를 재현)
insert into public.quizzes (id, kind, title, subtitle, hint, answer_text, lineup_id, opens_on) values
  ('lineup-chelsea',   '라인업', '이 라인업, 어느 시즌 첼시?',      null, null, null, null, current_date - 1),
  ('nation-wc-eleven', '국적',   '월드컵 한 팀의 11인 출신지',      null, null, null, null, current_date - 2),
  ('legend-mid-trio',  '레전드', '레전드 미드필더 3인의 공통점',    null, null, null, null, current_date - 3),
  ('coach-seven-teams','코치',   '이 사람이 거쳐간 7팀의 공통점',   null, null, null, null, current_date - 4);

-- ========== quiz_choices ==========
-- 오늘의 문제: seed_picks = round(5630 × pct/100), 마지막 항목(cl-1213)에서 합=5630 보정 (450 → 451)
insert into public.quiz_choices (id, quiz_id, position, team, season, is_correct, seed_picks) values
  ('lineup-rm-1718:rm-1718',  'lineup-rm-1718', 0, 'Real Madrid',  '2017/18', true,  1295), -- 23%
  ('lineup-rm-1718:bcn-1415', 'lineup-rm-1718', 1, 'FC Barcelona', '2014/15', false, 2308), -- 41%
  ('lineup-rm-1718:rm-1516',  'lineup-rm-1718', 2, 'Real Madrid',  '2015/16', false, 1576), -- 28%
  ('lineup-rm-1718:cl-1213',  'lineup-rm-1718', 3, 'Chelsea',      '2012/13', false,  451); -- 8% (+1 보정)

-- 예정 문제: 임시 보기 2개 (잠금 상태라 노출되지 않지만 통계 뷰가 깨지지 않게)
insert into public.quiz_choices (id, quiz_id, position, team, season, is_correct, seed_picks) values
  ('legend-video-30s:a',        'legend-video-30s',        0, '미공개 보기 1', null, true,  0),
  ('legend-video-30s:b',        'legend-video-30s',        1, '미공개 보기 2', null, false, 0),
  ('tmi-bellingham-nickname:a', 'tmi-bellingham-nickname', 0, '미공개 보기 1', null, true,  0),
  ('tmi-bellingham-nickname:b', 'tmi-bellingham-nickname', 1, '미공개 보기 2', null, false, 0);

-- 지난 문제: 정답/오답 2개에 seed_picks 배분 → quiz_stats.accuracy_pct·attempts 가 프로토타입과 일치
insert into public.quiz_choices (id, quiz_id, position, team, season, is_correct, seed_picks) values
  -- 정답률 19% · 8,821명: 1,676 / 7,145
  ('lineup-chelsea:a',    'lineup-chelsea',    0, '정답 보기', null, true,  1676),
  ('lineup-chelsea:b',    'lineup-chelsea',    1, '오답 보기', null, false, 7145),
  -- 정답률 38% · 6,210명: 2,360 / 3,850
  ('nation-wc-eleven:a',  'nation-wc-eleven',  0, '정답 보기', null, true,  2360),
  ('nation-wc-eleven:b',  'nation-wc-eleven',  1, '오답 보기', null, false, 3850),
  -- 정답률 31% · 4,090명: 1,268 / 2,822
  ('legend-mid-trio:a',   'legend-mid-trio',   0, '정답 보기', null, true,  1268),
  ('legend-mid-trio:b',   'legend-mid-trio',   1, '오답 보기', null, false, 2822),
  -- 정답률 12% · 3,017명: 362 / 2,655
  ('coach-seven-teams:a', 'coach-seven-teams', 0, '정답 보기', null, true,   362),
  ('coach-seven-teams:b', 'coach-seven-teams', 1, '오답 보기', null, false, 2655);

-- ========== badges ==========
-- screen-activity.jsx 6종 + RPC(cast_vote)가 참조하는 first-vote
insert into public.badges (id, label, description, color, position) values
  ('streak10',    '연속 10일',       '퀴즈',                  'var(--primary)',         0),
  ('first100',    '첫 100표',        '투표',                  '#171717',                1),
  ('derbyguy',    '북런던 더비러',   '아스널 vs 토트넘 5표',  '#9c0d1e',                2),
  ('streak30',    '연속 30일',       '퀴즈',                  'var(--hairline-strong)', 3),
  ('top1pct',     '상위 1%',         '주간',                  'var(--hairline-strong)', 4),
  ('kit-curator', '유니폼 큐레이터', '50표',                  'var(--hairline-strong)', 5),
  ('first-vote',  '첫 한 표',        '처음으로 투표에 참여',  '#171717',                6);

-- ========== poll_demographics ==========
-- 연령대별 응답 (BalanceRevealView 하드코딩 값 — 원본이 모든 밸런스 게임에 동일 적용)
insert into public.poll_demographics (poll_id, dimension, bucket, option_id, ratio, position) values
  ('goat', 'age', '20대 이하', 'goat:a', 0.42, 0),
  ('goat', 'age', '20대 이하', 'goat:b', 0.58, 1),
  ('goat', 'age', '30대',      'goat:a', 0.58, 2),
  ('goat', 'age', '30대',      'goat:b', 0.42, 3),
  ('goat', 'age', '40대 이상', 'goat:a', 0.66, 4),
  ('goat', 'age', '40대 이상', 'goat:b', 0.34, 5),
  ('mbappe-haaland', 'age', '20대 이하', 'mbappe-haaland:a', 0.42, 0),
  ('mbappe-haaland', 'age', '20대 이하', 'mbappe-haaland:b', 0.58, 1),
  ('mbappe-haaland', 'age', '30대',      'mbappe-haaland:a', 0.58, 2),
  ('mbappe-haaland', 'age', '30대',      'mbappe-haaland:b', 0.42, 3),
  ('mbappe-haaland', 'age', '40대 이상', 'mbappe-haaland:a', 0.66, 4),
  ('mbappe-haaland', 'age', '40대 이상', 'mbappe-haaland:b', 0.34, 5),
  ('sangam-westham', 'age', '20대 이하', 'sangam-westham:a', 0.42, 0),
  ('sangam-westham', 'age', '20대 이하', 'sangam-westham:b', 0.58, 1),
  ('sangam-westham', 'age', '30대',      'sangam-westham:a', 0.58, 2),
  ('sangam-westham', 'age', '30대',      'sangam-westham:b', 0.42, 3),
  ('sangam-westham', 'age', '40대 이상', 'sangam-westham:a', 0.66, 4),
  ('sangam-westham', 'age', '40대 이상', 'sangam-westham:b', 0.34, 5),
  ('kit-vs', 'age', '20대 이하', 'kit-vs:a', 0.42, 0),
  ('kit-vs', 'age', '20대 이하', 'kit-vs:b', 0.58, 1),
  ('kit-vs', 'age', '30대',      'kit-vs:a', 0.58, 2),
  ('kit-vs', 'age', '30대',      'kit-vs:b', 0.42, 3),
  ('kit-vs', 'age', '40대 이상', 'kit-vs:a', 0.66, 4),
  ('kit-vs', 'age', '40대 이상', 'kit-vs:b', 0.34, 5);

-- 지역별 1위 (screen-ranking.jsx RankingDetail 하드코딩 4건)
insert into public.poll_demographics (poll_id, dimension, bucket, option_id, ratio, position) values
  ('ballon-2026', 'region', '유럽',   'ballon-2026:mbappe',     0.38, 0),
  ('ballon-2026', 'region', '남미',   'ballon-2026:vinicius',   0.52, 1),
  ('ballon-2026', 'region', '아시아', 'ballon-2026:bellingham', 0.34, 2),
  ('ballon-2026', 'region', '북미',   'ballon-2026:haaland',    0.41, 3);

-- ========== trending_items ==========
-- screen-home.jsx trending 5건 (델타 부호 → up/down/new 매핑)
insert into public.trending_items (position, title, vote_count, delta, poll_id) values
  (1, '메시 vs 호날두, 마지막으로 한 판 더', 28412, 'up',   'goat'),        -- 28.4k · +12
  (2, '발롱도르 후보 10인 공개',             24891, 'up',   'ballon-2026'), -- 24.8k · +3
  (3, '맨유 새 유니폼 호불호 논쟁',           6109, 'down', 'kit-vs'),      -- kit-vs 실득표 합(6,109)과 일치
  (4, '음바페, 진짜 레알에서 행복할까',       6200, 'new',  null),          -- 6.2k · new
  (5, '벨링엄 폼이 떨어진 이유는?',           5000, 'up',   null);          -- 5.0k · +5

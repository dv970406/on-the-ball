/**
 * 구단 사전.
 * 완전할 필요는 없다 — 못 찾으면 clubs 가 비는 것뿐이고, 원문은 그대로 보존된다.
 * 표기 흔들림(Man Utd / Manchester United / #MUFC)을 정규 명칭으로 모으는 게 목적이다.
 */
const CLUB_ALIASES = {
  "Arsenal": ["Arsenal", "#AFC", "Gunners"],
  "Aston Villa": ["Aston Villa", "Villa", "#AVFC"],
  "Bournemouth": ["Bournemouth", "#AFCB"],
  "Brentford": ["Brentford", "#BFC"],
  "Burnley": ["Burnley", "#BurnleyFC"],
  "Brighton": ["Brighton", "Brighton & Hove Albion", "#BHAFC"],
  "Chelsea": ["Chelsea", "#CFC"],
  "Crystal Palace": ["Crystal Palace", "Palace", "#CPFC"],
  "Everton": ["Everton", "#EFC"],
  "Fulham": ["Fulham", "#FFC"],
  "Leeds United": ["Leeds United", "Leeds", "#LUFC"],
  "Liverpool": ["Liverpool", "#LFC"],
  "Manchester City": ["Manchester City", "Man City", "#MCFC"],
  "Manchester United": ["Manchester United", "Man Utd", "Man United", "#MUFC"],
  "Newcastle United": ["Newcastle United", "Newcastle", "#NUFC"],
  "Nottingham Forest": ["Nottingham Forest", "Forest", "#NFFC"],
  "Sunderland": ["Sunderland", "#SAFC"],
  "Tottenham Hotspur": ["Tottenham Hotspur", "Tottenham", "Spurs", "#THFC"],
  "West Ham United": ["West Ham United", "West Ham", "#WHUFC"],
  "Wolves": ["Wolves", "Wolverhampton", "#WWFC"],
  "Ipswich Town": ["Ipswich Town", "Ipswich"],
  "Southampton": ["Southampton", "#SaintsFC"],
  "Coventry City": ["Coventry City", "Coventry"],
  "Hull City": ["Hull City"],
  "West Bromwich Albion": ["West Bromwich Albion", "West Brom", "#WBA"],

  "Real Madrid": ["Real Madrid", "#RealMadrid"],
  "Barcelona": ["Barcelona", "Barca", "Barça", "#FCB"],
  "Atletico Madrid": ["Atletico Madrid", "Atlético Madrid", "Atletico"],
  "Sevilla": ["Sevilla"],
  "Valencia": ["Valencia"],
  "Villarreal": ["Villarreal"],
  "Celta Vigo": ["Celta Vigo", "Celta"],
  "Real Sociedad": ["Real Sociedad"],
  "Athletic Club": ["Athletic Club", "Athletic Bilbao"],
  "Real Betis": ["Real Betis", "Betis"],
  "Getafe": ["Getafe"],
  "Osasuna": ["Osasuna"],
  "Espanyol": ["Espanyol"],
  "Levante": ["Levante"],
  "Alaves": ["Alaves", "Alavés", "Deportivo Alavés", "Deportivo Alaves"],
  "Rayo Vallecano": ["Rayo Vallecano", "Rayo"],
  "Elche": ["Elche"],
  "Malaga": ["Malaga", "Málaga"],
  // ⚠ "Deportivo" 단독은 싣지 않는다 — Deportivo Cali·Saprissa 같은 다른 구단과 스페인어 일반어("director deportivo")를 잡는다
  "Deportivo La Coruna": ["Deportivo La Coruna", "Deportivo La Coruña", "Deportivo de La Coruña", "RC Deportivo", "Depor"],
  // ⚠ "Racing" 단독은 아르헨티나 Racing Club과 겹친다
  "Racing Santander": ["Racing Santander", "Racing de Santander"],

  "AC Milan": ["AC Milan", "Milan"],
  "Inter": ["Inter Milan", "Internazionale", "Inter"],
  "Juventus": ["Juventus", "Juve"],
  "Napoli": ["Napoli"],
  "Roma": ["AS Roma", "Roma"],
  "Lazio": ["Lazio"],
  "Atalanta": ["Atalanta"],
  "Fiorentina": ["Fiorentina"],
  "Udinese": ["Udinese"],
  "Bologna": ["Bologna"],
  "Torino": ["Torino"],
  "Genoa": ["Genoa"],
  "Sassuolo": ["Sassuolo"],
  "Cagliari": ["Cagliari"],
  "Parma": ["Parma"],
  "Lecce": ["Lecce"],
  "Como": ["Como 1907", "Como"],
  "Monza": ["Monza"],
  "Venezia": ["Venezia"],
  "Frosinone": ["Frosinone"],

  "Bayern Munich": ["Bayern Munich", "Bayern"],
  "Borussia Dortmund": ["Borussia Dortmund", "Dortmund", "#BVB"],
  "RB Leipzig": ["RB Leipzig", "Leipzig"],
  "Bayer Leverkusen": ["Bayer Leverkusen", "Leverkusen"],
  "Eintracht Frankfurt": ["Eintracht Frankfurt", "Frankfurt"],
  "VfB Stuttgart": ["VfB Stuttgart", "Stuttgart"],
  "SC Freiburg": ["SC Freiburg", "Freiburg"],
  "Werder Bremen": ["Werder Bremen", "Bremen"],
  "Borussia Monchengladbach": ["Borussia Mönchengladbach", "Borussia Monchengladbach", "Mönchengladbach", "Monchengladbach", "Gladbach"],
  "Mainz": ["FSV Mainz 05", "Mainz 05", "Mainz"],
  "Hoffenheim": ["TSG Hoffenheim", "1899 Hoffenheim", "Hoffenheim"],
  "FC Augsburg": ["FC Augsburg", "Augsburg"],
  "Schalke": ["FC Schalke 04", "Schalke 04", "Schalke"],
  "Hamburger SV": ["Hamburger SV", "Hamburg", "HSV"],
  "Union Berlin": ["Union Berlin"],
  "SC Paderborn": ["SC Paderborn 07", "SC Paderborn", "Paderborn"],
  "FC Koln": ["1. FC Köln", "FC Köln", "FC Koln", "Köln", "Koln", "Cologne"],
  "SV Elversberg": ["SV Elversberg", "Elversberg"],

  "Paris Saint-Germain": ["Paris Saint-Germain", "Paris Saint Germain", "Paris St-Germain", "Paris St Germain", "PSG", "#PSG"],
  "Marseille": ["Olympique de Marseille", "Marseille", "OM"],
  "Lyon": ["Olympique Lyonnais", "Lyon", "OL"],
  "Monaco": ["AS Monaco", "Monaco"],
  "Lille": ["Lille", "LOSC"],
  "Rennes": ["Stade Rennais", "Rennes"],
  "Nice": ["OGC Nice"],
  // ⚠ 일반 영단어와 같은 이름은 풀네임만 싣는다 — 매칭이 대소문자를 무시해 "lens"·"angers"가 구단이 된다
  "Lens": ["RC Lens"],
  "Angers": ["Angers SCO"],
  "Strasbourg": ["RC Strasbourg", "Strasbourg"],
  "Toulouse": ["Toulouse"],
  "Lorient": ["Lorient"],
  "Brest": ["Stade Brestois", "Brest"],
  "Auxerre": ["Auxerre"],
  "Troyes": ["ESTAC Troyes", "Troyes"],
  "Le Havre": ["Le Havre"],
  "Paris FC": ["Paris FC"],
  "Le Mans": ["Le Mans"],

  "Ajax": ["Ajax"],
  "PSV": ["PSV Eindhoven", "PSV"],
  "Feyenoord": ["Feyenoord"],
  "Benfica": ["Benfica"],
  "Porto": ["FC Porto", "Porto"],
  "Sporting CP": ["Sporting CP", "Sporting Lisbon"],
  "Club Brugge": ["Club Brugge", "Brugge"],
  "Galatasaray": ["Galatasaray"],
  "Fenerbahce": ["Fenerbahce", "Fenerbahçe"],
  "Celtic": ["Celtic"],
  "Rangers": ["Rangers"],
  "Al Hilal": ["Al Hilal"],
  "Al Nassr": ["Al Nassr"],

  // ── 잉글랜드 하부 리그 ─────────────────────────────────────────────────
  // 프리셋이 없다 — 원문 영문명으로, 엠블럼 없이 표시된다. 사전에 두는 이유는 글의 소속팀·행선지를
  // 알아보기 위해서다(없으면 "Watford confirm X"의 행선지를 읽지 못한다).
  // ⚠ 일반 영단어와 같은 이름은 풀네임만 — "reading"·"derby"·"boro"는 구단이 아닐 때가 더 많다.
  "Watford": ["Watford"],
  "Norwich City": ["Norwich City", "Norwich"],
  "Middlesbrough": ["Middlesbrough"],
  "Sheffield United": ["Sheffield United"],
  "Sheffield Wednesday": ["Sheffield Wednesday"],
  "Leicester City": ["Leicester City", "Leicester"],
  "Stoke City": ["Stoke City", "Stoke"],
  "Swansea City": ["Swansea City", "Swansea"],
  "Cardiff City": ["Cardiff City", "Cardiff"],
  "Millwall": ["Millwall"],
  "Bristol City": ["Bristol City"],
  "Preston North End": ["Preston North End", "Preston"],
  "Derby County": ["Derby County"],
  "Blackburn Rovers": ["Blackburn Rovers", "Blackburn"],
  "Portsmouth": ["Portsmouth"],
  "Oxford United": ["Oxford United"],
  "Charlton Athletic": ["Charlton Athletic", "Charlton"],
  "Wrexham": ["Wrexham"],
  "Birmingham City": ["Birmingham City"],
  "Luton Town": ["Luton Town", "Luton"],
  "Plymouth Argyle": ["Plymouth Argyle", "Plymouth"],
  "Reading": ["Reading FC"],

  // ── 동명 구단(가로채기용) ────────────────────────────────────────────
  // 위 구단의 짧은 별칭을 품은 **다른** 구단들이다. 긴 별칭이 먼저 매칭되어 자리를 지우므로
  // "Inter Miami"가 인테르로, "Queens Park Rangers"가 레인저스로 잡히지 않는다.
  // ⚠ 프리셋(club-presets.json)에 올리지 않는다 — 이름은 원문 영문 그대로, 엠블럼 없이 표시된다.
  "Inter Miami": ["Inter Miami"],
  "Atletico Mineiro": ["Atletico Mineiro", "Atlético Mineiro"],
  "Atletico Nacional": ["Atletico Nacional", "Atlético Nacional"],
  "Queens Park Rangers": ["Queens Park Rangers", "QPR"],
  "Forest Green Rovers": ["Forest Green Rovers", "Forest Green"],
  "Newcastle Jets": ["Newcastle Jets"],
  "Arsenal de Sarandi": ["Arsenal de Sarandí", "Arsenal de Sarandi"],
  "Liverpool Montevideo": ["Liverpool Montevideo", "Liverpool FC Montevideo"],
  "Everton de Vina del Mar": ["Everton de Viña del Mar", "Everton de Vina del Mar", "Everton de Viña", "Everton de Vina"],
  "Barcelona SC": ["Barcelona SC", "Barcelona Sporting Club"],
  "Deportivo Cali": ["Deportivo Cali"],
  "Deportivo Saprissa": ["Deportivo Saprissa"],
  "Rayo Majadahonda": ["Rayo Majadahonda"],
  "Dinamo Brest": ["Dinamo Brest"],
  "OL Reign": ["OL Reign"],
  "Viktoria Koln": ["Viktoria Köln", "Viktoria Koln"],
  "Fortuna Koln": ["Fortuna Köln", "Fortuna Koln"],
};

/**
 * 대소문자를 구분해 매칭하는 별칭 — 영어·스페인어 일반어와 같은 철자다.
 * ⚠ 나머지는 대소문자를 무시한다(해시태그·소문자 표기를 받으려고). 이 목록은 "소문자로 쓰이면 구단이 아닌" 것만이다:
 *   "spurs"(동사), "villa"(별장), "palace"·"forest", 스페인어 "como"·"rayo"·"levante", "om"·"ol".
 */
const CASE_SENSITIVE = new Set(["Como", "Rayo", "Levante", "Spurs", "OM", "OL", "Villa", "Forest", "Palace"]);

/**
 * 구단명 바로 뒤에 오면 **그 구단이 아니다** — 여자팀·2군·유스팀이다.
 * ⚠ 남자 1군으로 잡으면 글에 남자팀 엠블럼과 한국어명이 붙어 사실과 다른 표기가 된다.
 *   구단으로 세지 않되 자리는 지워서, 짧은 별칭이 다시 잡지 못하게 한다.
 */
const NOT_FIRST_TEAM = /^[\s-]*(?:Women|Ladies|Femenino|Feminino|Féminines|Frauen|WFC|II\b|B\b|U-?\d{2}\b|Castilla|Atl[eè]tic|Futures|Academy|Youth|Reserves)/;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 긴 별칭부터 매칭해야 "Manchester United" 가 "Manchester City" 로 오인되지 않는다 */
const ALIAS_INDEX = Object.entries(CLUB_ALIASES)
  .flatMap(([canonical, aliases]) => aliases.map((alias) => ({ alias, canonical })))
  .sort((a, b) => b.alias.length - a.alias.length)
  // 정규식은 한 번만 만든다 — 호출마다 별칭 수백 개를 컴파일하면 원본보다 1.5배 느려졌다
  .map(({ alias, canonical }) => ({
    canonical,
    alias,
    // ⚠ 해시태그는 끝 경계를 따로 둔다 — 없으면 "#FCBayern"이 "#FCB"(바르셀로나)에 걸린다(실제 수집 글 2건)
    re: new RegExp(
      alias.startsWith("#") ? `${escapeRe(alias)}(?![A-Za-z0-9_])` : `\\b${escapeRe(alias)}\\b`,
      CASE_SENSITIVE.has(alias) ? "gu" : "giu",
    ),
  }));

export function detectClubs(text) {
  const found = new Set();
  let masked = text;
  for (const { canonical, re } of ALIAS_INDEX) {
    re.lastIndex = 0;
    let hit = false;
    let any = false;
    for (const m of masked.matchAll(re)) {
      any = true;
      if (!NOT_FIRST_TEAM.test(masked.slice(m.index + m[0].length))) hit = true;
    }
    if (!any) continue;
    if (hit) found.add(canonical);
    // 매칭된 부분을 지워 짧은 별칭이 같은 자리를 다시 잡지 않게 한다
    masked = masked.replace(re, " ");
  }
  return [...found];
}

export function isClubName(s) {
  const t = s.trim().toLowerCase();
  return ALIAS_INDEX.some((a) => a.alias.toLowerCase() === t);
}

/** 사전에 오른 정규 영문명인가(검사용) — 별칭이 풀네임뿐인 구단("Angers SCO")도 있어 매칭으로는 판정할 수 없다 */
export function isKnownClub(canonical) {
  return Object.hasOwn(CLUB_ALIASES, canonical);
}

// app/community-data.jsx — seed content for the community prototype

const CM_CATS = ['전체', '이적설', '경기', '선수', '유니폼', '잡담'];

const CM_POSTS = [
  {
    id: 'p1', cat: '이적설', hot: true,
    title: '이사크 메디컬 통과했다는데, 이 금액이 맞나',
    author: '노스뱅크', avatar: 'ㄴ', time: '12분 전',
    excerpt: '이적료가 기사마다 다르게 나오는데 정리해보면 기본 1억 2천에 옵션 붙는 구조인 것 같음. 스트라이커 시장이 이렇게까지 올라간 게 맞나 싶다.',
    likes: 342, comments: 89, views: 12480, thumb: true, mine: false,
    tags: ['이적시장', 'Liverpool', '스트라이커'],
    body: [
      '이적료가 기사마다 다르게 나오는데, 정리해보면 기본 1억 2천에 출전·우승 옵션이 붙는 구조인 것 같다. 여기에 에이전트 수수료가 별도로 잡힌다는 얘기까지 나오는 중.',
      '문제는 이게 시장 전체의 기준선을 올린다는 거다. 지난 3년 동안 검증된 9번 자원의 가격은 계속 올라갔고, 이번 건이 성사되면 다음 여름에 비슷한 등급 선수를 노리는 팀은 최소 이 가격부터 협상을 시작해야 한다.',
      '개인적으로는 선수 자체에 대한 의문은 없다. 최근 두 시즌 90분당 기대 득점과 실제 득점이 거의 붙어 있고, 라인 사이에서 받아주는 움직임도 되는 유형이라 전술적으로 붙일 자리는 많다.',
      '다만 이 금액이면 백업 자원까지 같이 정리해야 하는데, 그 계획이 안 보인다는 게 좀 걸린다. 부상 한 번이면 시즌이 흔들리는 스쿼드 구조는 그대로다.',
    ],
  },
  {
    id: 'p2', cat: '유니폼',
    title: '아스날 어웨이 킷 실물 봤는데 사진이랑 완전 다름',
    author: '킷수집가', avatar: 'ㅋ', time: '1시간 전',
    excerpt: '온라인 사진에서는 그냥 민트색인데 실물은 각도에 따라 회색으로 보인다. 원단 질감도 생각보다 두꺼움.',
    likes: 214, comments: 47, views: 8210, thumb: true, mine: false,
    tags: ['Arsenal', '어웨이킷'],
  },
  {
    id: 'p3', cat: '선수', hot: true,
    title: '음바페가 발롱도르 못 받는 이유를 진지하게 정리해봄',
    author: '전술노트', avatar: 'ㅈ', time: '3시간 전',
    excerpt: '득점은 매년 최상위권인데 수상은 계속 밀린다. 결국 팀 성적과 토너먼트 임팩트 문제인데 이게 공정한 기준인지는 별개.',
    likes: 508, comments: 156, views: 24390, thumb: false, mine: false,
    tags: ['Ballon d\'Or', '떡밥'],
  },
  {
    id: 'p4', cat: '경기',
    title: '손흥민 LAFC 홈경기 직관 후기 (사진 많음)',
    author: 'LA거주중', avatar: 'L', time: '5시간 전',
    excerpt: '경기장 분위기가 생각보다 훨씬 좋았다. 한국인 관중이 절반 가까이 되는 느낌이었고 콜도 계속 나왔음.',
    likes: 892, comments: 203, views: 41200, thumb: true, mine: false,
    tags: ['MLS', '직관후기'],
  },
  {
    id: 'p5', cat: '잡담',
    title: '케인 뮌헨 3년차, 이번엔 진짜 우승할 것 같은데',
    author: '분데스팬', avatar: 'ㅂ', time: '어제',
    excerpt: '스쿼드 뎁스가 작년이랑 다르다. 리그는 거의 확정이고 문제는 챔스인데...',
    likes: 176, comments: 64, views: 9840, thumb: false, mine: false,
    tags: ['Bayern', 'Kane'],
  },
  {
    id: 'p6', cat: '이적설',
    title: '겨울에 진짜 움직일 것 같은 선수 5명 정리',
    author: '온더볼', avatar: '온', time: '어제',
    excerpt: '계약 18개월 남았고 재계약 협상 멈춘 선수들 위주로 골라봤다.',
    likes: 133, comments: 38, views: 7120, thumb: false, mine: true,
    tags: ['이적시장'],
  },
];

const CM_COMMENTS = [
  {
    id: 'c1', author: '미드필더', avatar: 'ㅁ', time: '8분 전', likes: 42, liked: false, mine: false,
    text: '옵션 포함이면 사실상 1억 4천 넘는 거 아닌가. 그 돈이면 윙어 두 명 사는 게 낫다고 봄.',
    replies: [
      { id: 'c1r1', author: '노스뱅크', avatar: 'ㄴ', time: '5분 전', likes: 11, liked: false, mine: false, op: true,
        text: '윙어 두 명 사도 마무리 못 하면 똑같음. 지난 시즌 유효슈팅 대비 득점 보면 답 나옴.' },
      { id: 'c1r2', author: '온더볼', avatar: '온', time: '2분 전', likes: 3, liked: false, mine: true,
        text: '둘 다 맞는 말인데 결국 뎁스 문제라 여름에 한 명 더 안 사면 의미 없을 듯' },
    ],
  },
  {
    id: 'c2', author: '킷수집가', avatar: 'ㅋ', time: '21분 전', likes: 28, liked: false, mine: false,
    text: '메디컬 통과 기사 소스가 하나뿐이라 아직은 반신반의 중. 공홈 뜨기 전엔 모름.',
    replies: [],
  },
  {
    id: 'c3', author: '전술노트', avatar: 'ㅈ', time: '34분 전', likes: 67, liked: true, mine: false,
    text: '90분당 기대 득점 얘기 나와서 덧붙이면, 이 선수는 박스 안 터치 수가 리그 3위였음. 단순 결정력이 아니라 위치 선정이 좋은 케이스라 감독 바뀌어도 안 죽는 유형이다.',
    replies: [
      { id: 'c3r1', author: '분데스팬', avatar: 'ㅂ', time: '30분 전', likes: 9, liked: false, mine: false,
        text: '이 댓글이 본문보다 낫다' },
    ],
  },
];

Object.assign(window, { CM_CATS, CM_POSTS, CM_COMMENTS });

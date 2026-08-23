# 서베이 면 배경 이미지 (로컬 시드)

`supabase/seed.sql`의 `survey_option.image_path`가 가리키는 파일들이다.
**`db reset`은 이 파일을 올리지 않는다** — 스토리지는 SQL 밖이라 따로 돌려야 한다.

```bash
supabase db reset
node scripts/upload-survey-images.mjs supabase/seed-images
```

디렉터리 이름이 곧 `survey.id`이고, `image_path`는 `{디렉터리}/{파일명}`이 된다.
경로 형태는 DB CHECK가 강제한다(`^[0-9]+/…\.(webp|jpg|jpeg|png)$`).

> ⚠ **디렉터리 번호는 시드가 배정받는 id에 묶여 있다.**
> `image_path`는 `seed.sql`이 `survey.id`로 **계산**하지만 여기 폴더 이름은 저장소에
> 박혀 있다. 그래서 마이그레이션이 `survey` 행을 하나라도 넣으면(운영 문항의 정식 경로다)
> identity 시퀀스가 밀려 시드 서베이의 id가 바뀌고, **DB의 경로만 따라 움직여 이미지가
> 통째로 404가 된다.** 그때는 이 폴더 이름도 함께 옮긴다.

## 출처와 라이선스

전부 **위키미디어 커먼즈의 자유 라이선스** 사진이다. 구글 이미지 검색 결과는 대부분
언론사 보도사진과 상표 로고라 저장소에 넣을 수 없어 이쪽에서 받았다.

⚠ **CC BY / CC BY-SA는 저작자 표시가 의무다.** 이 사진을 화면에 노출한 채 배포하려면
앱 어딘가(예: 서베이 상세 하단이나 정보 화면)에 아래 표시를 남겨야 한다.
CC BY-SA는 **동일조건 변경허락**까지 요구하므로, 부담스러우면 CC BY 또는 CC0 사진으로
바꾸거나 직접 촬영·구매한 사진을 쓴다.

| 파일 | 원본 | 라이선스 | 저작자 |
|---|---|---|---|
| `5/messi.jpg` | [Lionel Messi WC2022.jpg](https://commons.wikimedia.org/wiki/File:Lionel_Messi_WC2022.jpg) | CC BY 4.0 | Hossein Zohrevand |
| `5/ronaldo.jpg` | [Cristiano Ronaldo (5079838876).jpg](https://commons.wikimedia.org/wiki/File:Cristiano_Ronaldo_(5079838876).jpg) | CC BY-SA 2.0 | Dagur Brynjólfsson from Hafnarfjordur, Iceland |
| `3/mbappe.jpg` | [Kylian Mbappe France v Senegal 16 June 2026-](https://commons.wikimedia.org/wiki/File:Kylian_Mbappe_France_v_Senegal_16_June_2026-345.jpg) | CC BY-SA 4.0 | Bryan Berlin |
| `3/bellingham.jpg` | [Jude Bellingham Birmingham 2019.jpg](https://commons.wikimedia.org/wiki/File:Jude_Bellingham_Birmingham_2019.jpg) | CC BY-SA 4.0 | Struway2 |
| `3/haaland.jpg` | [Erling Haaland 2023.jpg](https://commons.wikimedia.org/wiki/File:Erling_Haaland_2023.jpg) | CC BY-SA 4.0 | Jacek Stanislawek |
| `4/epl.jpg` | [Manchester , Trafford - Old Trafford Stadium](https://commons.wikimedia.org/wiki/File:Manchester_,_Trafford_-_Old_Trafford_Stadium_-_geograph.org.uk_-_3724146.jpg) | CC BY-SA 2.0 | Lewis Clarke |
| `4/laliga.jpg` | [Santiago Bernabeu Stadium Front.jpg](https://commons.wikimedia.org/wiki/File:Santiago_Bernabeu_Stadium_Front.jpg) | CC BY-SA 4.0 | Schumi4ever |
| `4/bundesliga.jpg` | [Allianz arena golden hour Richard Bartz.jpg](https://commons.wikimedia.org/wiki/File:Allianz_arena_golden_hour_Richard_Bartz.jpg) | CC BY-SA 2.5 | Richard Bartz, Munich aka Makro Freak |

⚠ 사진은 **정사각 720px로 크롭·압축**했다(면이 정사각 카드의 조각이고 버킷 상한이 1MiB다).
원본은 위 링크에 있다.

## 이미지를 바꿀 때

**같은 파일명으로 덮지 말고** 새 파일명을 쓴 뒤 `seed.sql`의 파일명을 함께 고친다.
같은 경로로 덮으면 공개 URL이 그대로라 브라우저·CDN 캐시에 옛 이미지가 남는다
(아바타가 업로드마다 uuid를 뽑는 것과 같은 이유).

⚠ `survey_option`은 **`image_path`가 없으면 `bg_color`로 폴백**한다. 그래서 사진을
준비하지 못한 문항도 그대로 동작한다 — 시드의 "세리에 A" 면이 그 자리다.

# 이이카와 (Iikawa Pet)

바탕화면 작업표시줄 위를 페르세포네 · 사토 · 자스민이 돌아다니는 데스크탑 다마고치.

## 하는 일
- 작업표시줄 위를 걷고, 멈추고, 두리번거리고, 뛰어오른다 (원본 3뷰 렌더를 그대로 사용, 변형 애니메이션)
- 우하단 🍙 버튼 → 상태창 (배고픔/기분, 먹이)
- 먹이를 **끌어다 놓거나 클릭**하면 걸어와서 먹는다. 트레이 메뉴에서도 줄 수 있다
- 캐릭터를 **클릭**하면 반응, **끌어서 들어올렸다 놓으면** 떨어진다
- 자스민은 마우스를 빨리 휘두르면 도망간다
- **리벳건**: 상태창의 🔫을 켜고 캐릭터를 클릭하면 그 자리에 박혀 멈춘다 (연두색 피). 캐릭터를 끌어서 든 채 **우클릭**하면 공중에 그대로 박힌다. 박힌 캐릭터를 끌면 뽑힌다. 수치에는 영향 없음
- 앱을 꺼도 상태가 저장된다 (꺼진 동안은 천천히 배고파지며, 죽지는 않는다)
- 캐릭터 영역 밖은 클릭이 통과되어 다른 창을 평소처럼 쓸 수 있다

## 실행 / 빌드
```bash
npm install
npm start          # 개발 실행
npm run dist       # Windows Portable exe (Windows에서)
```
GitHub에 push하면 Actions(`Build Windows`)가 exe를 빌드한다. 결과물은 Actions 실행 페이지의 Artifacts(`IikawaPet-windows`),
`v0.1.0` 같은 태그를 푸시하면 Releases에도 올라간다. 서명이 없어서 SmartScreen 경고가 뜨면 "추가 정보 → 실행".

## 에셋
`tools/extract.py` 가 3뷰 렌더 시트에서 6개 뷰를 잘라 배경을 지운다 (`assets/characters/*.png`),
`tools/make_masks.py` 가 클릭 판정용 마스크를 만든다. 요구: `pip install opencv-python-headless numpy pillow`.

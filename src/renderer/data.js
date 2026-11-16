// 캐릭터/먹이 정의. 성격은 속도, 취향, 대사로 표현한다.
export const CHARACTERS = {
  persephone: {
    name: '페르세포네', height: 170, speed: 62, likes: ['rice'], skittish: false,
    lines: {
      idle: ['히히히힛', '히히… 히히히', '헤헤헤', '뭐 하고 있어? 히히', '(실실)'],
      hungry: ['배고프다~ 히히', '밥… 밥 줘… 히히', '배고파도 웃는다 히히'],
      eat: ['냠냠 히히', '맛있다!! 히히히', '와구와구'],
      like: ['제일 좋아!! 히히히히', '더 줘!! 히히'],
      petted: ['간지러워 히히히', '또 해줘!', '히히히힛'],
      scared: ['히힉!', '깜짝이야 히히'],
      full: ['배불러~ 히히', '이제 못 먹어 히히'],
      land: ['쿵! 히히', '아야… 히히'],
      drag: ['날아간다~ 히히', '높다 히히'],
      drop: ['밥이다!! 히히'],
    },
  },
  sato: {
    name: '사토', height: 190, speed: 40, likes: ['cake'], skittish: false,
    lines: {
      idle: ['…', '하아…', '인생이란…', '오늘도 똑같네', '…비 오려나'],
      hungry: ['배고프다. 아니, 괜찮아.', '…밥 줄 사람이 없나', '굶는 것도 익숙하지'],
      eat: ['…먹는다', '맛있네. 슬프지만.', '우물우물…'],
      like: ['…이건 좀 좋네', '단 건 위로가 돼'],
      petted: ['…고마워', '그냥 둬…', '위로는 필요 없어. 더 해줘'],
      scared: ['…놀랐다', '하아…'],
      full: ['됐어… 배불러', '…더는 못 먹겠어'],
      land: ['…아프다', '쿵. 인생처럼'],
      drag: ['놔줘…', '내려줘…', '…어지럽다'],
      drop: ['…밥인가'],
      fish: ['…생선? 친척이라 좀', '…먹기 미안하네'],
    },
  },
  jasmine: {
    name: '자스민', height: 165, speed: 88, likes: ['bug'], skittish: true,
    lines: {
      idle: ['어, 어…', '두리번두리번', '누, 누구 있어?', '찌릿찌릿'],
      hungry: ['배고파아…', '밥… 어디 없나…', '더듬이가 떨려…'],
      eat: ['앗, 맛있다!', '냠냠냠냠', '쪼, 쪼금씩 먹을게'],
      like: ['벌레!!! 최고!!!', '이거야 이거!'],
      petted: ['으앗! 만지지 마!', '더듬이는 안 돼!', '…조금만 더'],
      scared: ['으아아악!', '도, 도망쳐!', '엄마야!'],
      full: ['배불러어…', '이제 안 먹어도 돼'],
      land: ['으앗!', '꺄악!'],
      drag: ['무서워어어!', '내려줘!!!', '높아!! 높아!!'],
      drop: ['밥이다!', 'ㅅ…밥?'],
    },
  },
};

export const FOODS = {
  rice: { emoji: '🍚', name: '밥', nutri: 30 },
  fish: { emoji: '🐟', name: '생선', nutri: 25 },
  bug: { emoji: '🐛', name: '벌레', nutri: 20 },
  cake: { emoji: '🍰', name: '케이크', nutri: 15 },
};

export const IDS = Object.keys(CHARACTERS);
export const VIEWS = ['front', 'side', 'back'];

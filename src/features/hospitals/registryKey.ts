/**
 * 같은 병원을 두 번 만들지 않기 위한 키.
 *
 * 왜 필요한가: 공공데이터에 아직 없는 병원을 손으로 넣는다(서울시 '우리아이 안심의원'은
 * 시 사업이라 국립중앙의료원 API 에 없을 수 있다). 나중에 배치가 같은 병원을 가져오면
 * **새 행이 아니라 그 행이 갱신되어야** 한다.
 *
 * 새 행이 생기면 두 가지가 깨진다 — 목록에 같은 병원이 두 번 보이고, 그 병원을 가리키던
 * 현장톡 글이 둘 중 하나만 따라간다.
 *
 * 그래서 수동 입력과 배치가 **이 함수 하나**로 키를 만든다. 두 곳에서 각자 정규화하면
 * 언젠가 미묘하게 갈라지고, 갈라진 날 같은 병원이 둘이 된다.
 *
 * hpid 를 키로 쓰지 않는 이유: 수동 입력 병원에는 hpid 가 없다. 가짜 hpid 를 만들면
 * 진짜처럼 보이는 값이 화면·로그로 새어 나가고, 나중에 그것이 공공데이터 id 인지
 * 우리가 만든 것인지 구분할 수 없다.
 */

/**
 * 이름에서 비교에 방해되는 것만 뺀다.
 *
 * 빼는 것: 공백, 괄호, 가운뎃점, 하이픈, 쉼표, 마침표.
 * 공공데이터와 손으로 적은 이름은 이런 것들에서 갈린다 —
 * "마곡 로뎀소아청소년과"와 "마곡로뎀소아청소년과"는 같은 병원이다.
 *
 * 빼지 않는 것: 한글·숫자·영문. '제1' 과 '제2' 는 다른 병원이고,
 * '연세의원'과 '연세365의원'도 다른 병원이다.
 * 영문은 대소문자만 맞춘다.
 */
export function normalizeHospitalName(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[\s()[\]{}·・,.\-–—_/\\'"]/g, "")
    .toLowerCase();
}

/** 시군구도 같은 방식으로. "강서구"와 "강서 구"가 갈리지 않게. */
export function normalizeRegion(region: string): string {
  return region.normalize("NFC").replace(/\s/g, "");
}

/**
 * `'<시군구>|<정규화한 이름>'`
 *
 * 시군구를 앞에 두는 이유: 전국에 '연세의원'이 여럿이다. 이름만으로는 같은 병원인지
 * 알 수 없다. 시군구까지 같고 이름이 같으면 같은 병원으로 본다 — 완벽하지 않지만
 * 자동 병합의 기준으로 이보다 느슨하게 잡으면 다른 병원이 합쳐진다.
 *
 * 시군구가 없으면 null 이다. 지역을 모르는 병원은 **자동 병합하지 않는다** —
 * 이름만으로 합치는 것이 가장 흔한 사고다.
 */
export function buildRegistryKey(input: {
  sigungu: string | null | undefined;
  name: string | null | undefined;
}): string | null {
  const sigungu = input.sigungu?.trim();
  const name = input.name?.trim();
  if (!sigungu || !name) return null;

  const normalizedName = normalizeHospitalName(name);
  if (normalizedName === "") return null;

  return `${normalizeRegion(sigungu)}|${normalizedName}`;
}

/**
 * 이 키로 못 잡는 경우들.
 *
 * 배치가 이 목록에 해당하는 상황을 만나면 **자동으로 합치거나 고치지 않고 보고한다.**
 * 사람이 보고 판단할 일이다 — 잘못 합친 병원을 되돌리는 것은 잘못 나눈 것보다 어렵다.
 */
export type RegistryMismatch =
  /** 전화번호는 같은데 키가 다르다. 개명했거나 이전했을 수 있다. */
  | "same_phone_different_key"
  /** 키는 같은데 전화번호가 다르다. 같은 시군구의 동명 병원일 수 있다. */
  | "same_key_different_phone";

/** 전화번호 비교용. 표기(02-123-4567 / 021234567)가 달라도 같게 본다. */
export function normalizePhone(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * 들어온 병원과 이미 있는 병원을 비교해서, 사람이 봐야 하는 경우를 가려낸다.
 * 키가 같고 전화도 같으면 그냥 갱신하면 된다(null 을 돌려준다).
 */
export function findRegistryMismatch(
  incoming: { registryKey: string | null; tel: string | null },
  existing: { registryKey: string | null; tel: string | null },
): RegistryMismatch | null {
  const incomingPhone = normalizePhone(incoming.tel);
  const existingPhone = normalizePhone(existing.tel);

  if (incoming.registryKey !== existing.registryKey) {
    return incomingPhone !== null && incomingPhone === existingPhone
      ? "same_phone_different_key"
      : null;
  }

  if (incomingPhone !== null && existingPhone !== null && incomingPhone !== existingPhone) {
    return "same_key_different_phone";
  }
  return null;
}

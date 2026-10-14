/**
 * 약관·방침 주소. 파일을 읽지 않으므로 클라이언트 컴포넌트에서도 import 할 수 있다.
 * (documents.ts 는 node:fs 를 쓴다 — 거기서 경로를 가져오면 클라이언트 빌드가 깨진다.)
 */
export const LEGAL_DOC_PATH: Record<"terms" | "privacy", string> = {
  terms: "/terms",
  privacy: "/privacy",
};

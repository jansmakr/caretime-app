import type { Config } from "tailwindcss";

/**
 * CareTime 디자인 토큰.
 * 기획안 52항(White 기반 / Light Gray 배경 / Soft Blue 포인트 / 그림자 최소)을 그대로 따른다.
 * 상태색은 4개로 고정한다 — 53항 "알록달록한 상태색 10개" 금지.
 *
 * 색은 모두 WCAG AA(4.5:1) 대비를 확인한 값이다. 야간·저조도에서 읽혀야 한다.
 *  - DEFAULT : 흰 배경 위 글자·점·테두리
 *  - soft    : 상태 배경
 *  - ink     : soft 배경 위 글자
 * 화면 코드에 hex 를 직접 쓰지 않고 이 토큰만 쓴다.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#FFFFFF",
        canvas: "#F2F4F6",
        fill: "#F2F4F6",
        line: "#E5E8EB",
        ink: { DEFAULT: "#191F28", muted: "#4E5968", faint: "#5F6B78" },
        blue: { DEFAULT: "#1D6CE6", deep: "#1757C2", soft: "#E8F3FF" },
        // 출처/상태 4색. 이 4개 외에 상태를 표현하는 색을 추가하지 않는다.
        confirmed: { DEFAULT: "#0A7F55", soft: "#E3F5EC", ink: "#0A6B48" },
        caution: { DEFAULT: "#B35600", soft: "#FFF1E0", ink: "#9A4A00" },
        limited: { DEFAULT: "#D22F3C", soft: "#FDECEE", ink: "#B3232F" },
        unverified: { DEFAULT: "#8B95A1", soft: "#F2F4F6", ink: "#5F6B78" },
      },
      fontFamily: {
        sans: [
          "'Pretendard Variable'",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "'Apple SD Gothic Neo'",
          "'Noto Sans KR'",
          "'Malgun Gothic'",
          "sans-serif",
        ],
      },
      borderRadius: { card: "20px", field: "14px", pill: "999px" },
      maxWidth: { app: "480px" },
      boxShadow: {
        // 그림자는 딱 한 종류만 존재한다. 카드에는 쓰지 않고 고정 바에만 쓴다.
        bar: "0 -1px 0 0 #E5E8EB",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

/**
 * CareTime 디자인 토큰.
 * 기획안 52항(White 기반 / Light Gray 배경 / Soft Blue 포인트 / 그림자 최소)을 그대로 따른다.
 * 상태색은 4개로 고정한다 — 53항 "알록달록한 상태색 10개" 금지.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#FFFFFF",
        canvas: "#F5F7FA",
        line: "#E3E8EE",
        ink: { DEFAULT: "#16202B", muted: "#5B6B7C", faint: "#6E7C8A" },
        blue: { DEFAULT: "#2F6FD0", soft: "#EDF3FC", deep: "#255BAC" },
        // 출처/상태 4색. 이 4개 외에 상태를 표현하는 색을 추가하지 않는다.
        confirmed: "#1E9E6A",
        caution: "#D98324",
        limited: "#C4413A",
        unverified: "#8A97A6",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "'Apple SD Gothic Neo'",
          "'Noto Sans KR'",
          "sans-serif",
        ],
      },
      borderRadius: { card: "14px", pill: "999px" },
      maxWidth: { app: "480px" },
      boxShadow: {
        // 그림자는 딱 한 종류만 존재한다. 카드에는 쓰지 않고 고정 바에만 쓴다.
        bar: "0 -1px 0 0 #E3E8EE",
      },
    },
  },
  plugins: [],
};

export default config;

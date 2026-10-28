import { InfoPage } from "@/components/detail/info-page";

export const metadata = { title: "이용 안내 · Superlike" };

export default function About() {
  return (
    <InfoPage
      eyebrow="ABOUT"
      title="이용 안내"
      sections={[
        {
          heading: "Superlike는",
          body: ["신보와 차트를 둘러보고, 좋아하는 곡을 모아 두고, 챗봇에게 말로 음악을 부탁하는 디스커버리 앱이에요."],
        },
        {
          heading: "재생과 데이터",
          body: [
            "재생은 Spotify 웹 플레이어로 해요. Spotify Premium 계정과 데스크톱 브라우저가 필요해요.",
            "신보와 차트는 Apple Music에서 가져와요. 연결하지 않아도 둘러볼 수 있어요.",
          ],
        },
        {
          heading: "좋아요와 플레이리스트",
          body: ["좋아요와 만든 플레이리스트는 Superlike에만 저장돼요. Spotify 라이브러리는 읽지도, 바꾸지도 않아요."],
        },
      ]}
    />
  );
}

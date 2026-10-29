import { InfoPage } from "@/components/detail/info-page";

export const metadata = { title: "개인정보 · Superlike" };

export default function Privacy() {
  return (
    <InfoPage
      eyebrow="PRIVACY"
      title="개인정보"
      sections={[
        {
          heading: "받는 정보",
          body: [
            "Spotify 연결 시: 이름, 이메일, 구독 종류(Premium 여부), 최근 재생 기록.",
            "금요일의 앨범 편지를 신청하면: 이메일 주소와 닉네임.",
          ],
        },
        {
          heading: "쓰는 곳",
          body: [
            "재생 기록은 홈의 취향과 주간 통계를 만드는 데만 써요. 이메일은 편지를 보내는 데만 써요.",
            "받은 정보를 다른 곳에 팔거나 넘기지 않아요.",
          ],
        },
        {
          heading: "지우기",
          body: [
            "Spotify 연결은 Spotify 계정 설정에서 언제든 끊을 수 있어요. 편지는 메일 속 링크로 해지하면 주소를 더 쓰지 않아요.",
            "저장된 정보를 지우고 싶으면 문의·제보로 알려 주세요.",
          ],
        },
        {
          heading: "문의",
          body: ["개인정보에 대해 궁금한 점은 아래 메일로 보내 주세요."],
          mail: "myyseooo@gmail.com",
        },
      ]}
    />
  );
}

import { InfoPage } from "@/components/detail/info-page";

export const metadata = { title: "문의·제보 · Superlike" };

export default function Contact() {
  return (
    <InfoPage
      eyebrow="CONTACT"
      title="문의·제보"
      sections={[
        {
          heading: "버그·의견",
          body: ["github.com/honeydragoneye/SUPERLIKE 의 Issues에 남겨 주세요."],
        },
        {
          heading: "정보 삭제 요청",
          body: ["같은 곳에 남기거나, 구독 메일에 답장해 주세요."],
        },
      ]}
    />
  );
}

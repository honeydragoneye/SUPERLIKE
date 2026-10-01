import { Placeholder } from "@/components/detail/placeholder";

export default function Mypage() {
  return (
    <Placeholder
      eyebrow="MYPAGE"
      title="마이페이지"
      subtitle="연결된 Spotify 계정"
      planned={[
        "계정 정보와 연결 상태",
        "내가 만든 스테이션 기록",
        "좋아요한 곡과 보관함",
        "재생 통계",
      ]}
    />
  );
}

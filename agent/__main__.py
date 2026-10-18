"""터미널에서 에이전트와 대화: python -m agent"""

from agent.loop import run_agent


def main() -> None:
    history: list[dict] = []
    print("음악 에이전트 (종료: 빈 줄)")
    while question := input("\n> ").strip():
        answer = ""
        for event in run_agent(history, question):
            if event["type"] == "tool_call":
                print(f"\n  [도구] {event['name']}({event['arguments']})")
            elif event["type"] == "tool_result":
                result = event["result"]
                shown = (
                    f"{result['checked']}곡 확인 → {len(result['tracks'])}곡 {[t['title'] for t in result['tracks'][:4]]}"
                    + (f" / {result['note']}" if result.get("note") else "")
                    if isinstance(result, dict) and "tracks" in result
                    else result
                )
                print(f"  [결과] {shown}")
            elif event["type"] == "retry":
                answer = ""
                print(f"\n  [재시도] {event['reason']}\n")
            elif event["type"] == "token":
                answer += event["data"]
                print(event["data"], end="", flush=True)
            elif event["type"] == "done":
                print(f"\n  (모델 호출 {event['steps']}회)")
        history += [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]


main()

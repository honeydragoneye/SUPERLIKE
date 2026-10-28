/**
 * A script that has to run while the HTML is still being parsed.
 *
 * React warns when a component renders a <script>; typing it as plain text on
 * the client (where it has already done its work) keeps the warning away, and
 * suppressHydrationWarning accepts the difference.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

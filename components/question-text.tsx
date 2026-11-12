/** Only our underline marker is formatted; all document text is escaped by React. */
export default function QuestionText({ text }: { text: string }) {
  return <>{text.split(/(<u>[^]*?<\/u>)/g).map((part, i) => part.startsWith('<u>') && part.endsWith('</u>')
    ? <u key={i}>{part.slice(3, -4)}</u> : part)}</>;
}

type Props = {
  totalAnswered: number;
  universeSize: number;
};

export function Progress({ totalAnswered, universeSize }: Props) {
  return (
    <div className="row space" style={{ color: "var(--muted)", fontSize: 13 }}>
      <div>
        {totalAnswered} answer{totalAnswered === 1 ? "" : "s"} — intervals
        tighten as you go
      </div>
      <div>sampling adaptively from {universeSize.toLocaleString()} words</div>
    </div>
  );
}

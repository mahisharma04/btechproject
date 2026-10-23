const AnswerText = ({ text, sources = [], className = '' }) => {
  const parts = String(text ?? '').split(/(\[\d+\])/g);

  return (
    <p className={`leading-relaxed whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) return part;
        const index = Number(match[1]);
        const source = sources[index - 1];
        return (
          <sup
            key={i}
            title={source ? `Source ${index}: ${source.meetingTitle}` : `Source ${index}`}
            className="inline-flex items-center justify-center min-w-[1.05rem] h-[1.05rem] px-1 mx-0.5 rounded bg-gray-700 text-primary text-[0.65rem] font-semibold"
          >
            {index}
          </sup>
        );
      })}
    </p>
  );
};

export default AnswerText;

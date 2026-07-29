const GITHUB = "https://github.com/WafflesDevs";
const LINKEDIN = "https://www.linkedin.com/in/ayaanalii/";

export default function MadeBy({ className = "" }) {
  return (
    <div className={`made-by ${className}`.trim()}>
      <span className="made-by-line">
        Made by{" "}
        <a
          className="made-by-name"
          href={GITHUB}
          target="_blank"
          rel="noopener noreferrer"
        >
          WafflesDevs
        </a>
      </span>
      <span className="made-by-links">
        <a href={GITHUB} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <span className="made-by-dot" aria-hidden>
          ·
        </span>
        <a href={LINKEDIN} target="_blank" rel="noopener noreferrer">
          LinkedIn
        </a>
      </span>
    </div>
  );
}

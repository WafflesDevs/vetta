export default function Logo({ size = 28, onDark = true }) {
 return (
 <span className="logo-wrap" style={{ width: size, height: size }}>
 <img
 className={onDark ? "logo-img logo-on-dark" : "logo-img"}
 src="/brand/vetta-icon.png"
 alt="Vetta"
 width={size}
 height={size}
 />
 </span>
 );
}

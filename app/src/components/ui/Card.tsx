export function Card({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return <div id={id} className={`glass rounded-sm p-5 ${className}`}>{children}</div>;
}

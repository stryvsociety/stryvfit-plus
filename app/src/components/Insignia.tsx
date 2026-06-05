import Image from 'next/image';

export function Insignia({ className = '' }: { className?: string }) {
  return (
    <Image
      src="/stryv-insignia.svg"
      alt=""
      width={256}
      height={256}
      className={className}
      aria-hidden="true"
      priority
      unoptimized
    />
  );
}

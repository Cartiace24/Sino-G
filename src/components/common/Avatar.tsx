import { cn } from '../../lib/utils';

/** Hash-assigned flat palette (light fills + ink initial — readable in both themes). */
const PALETTE = ['av-a', 'av-b', 'av-c', 'av-d', 'av-e', 'av-f', 'av-g', 'av-h'];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

/** Initials avatar in the approved flat palette, or the uploaded photo. */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('avatar', size === 'sm' && 'sm', size === 'lg' && 'lg', size === 'xl' && 'xl', className)}
        style={{ objectFit: 'cover' }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'avatar',
        colorFor(name),
        size === 'sm' && 'sm',
        size === 'lg' && 'lg',
        size === 'xl' && 'xl',
        className,
      )}
    >
      {initial}
    </span>
  );
}

export function AvatarStack({ names, photos = [] }: { names: string[]; photos?: (string | null)[] }) {
  const shown = names.slice(0, 4);
  const extra = names.length - shown.length;
  return (
    <div className="stack">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} src={photos[i] ?? null} />
      ))}
      {extra > 0 && <span className="stack-more">+{extra}</span>}
    </div>
  );
}

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');
const appRoot = join(repoRoot, 'app');

describe('admin surface regressions', () => {
  test('keeps stale browser-comment copy out of shipped source and operator docs', () => {
    const offenders = scanFiles([join(appRoot, 'src'), join(repoRoot, 'docs'), join(appRoot, 'README.md')], [
      /yesterday'?s bugs have been zapped/i,
      /bugs have been zapped/i,
      /Nutrition Command/i,
      /CLIENT RAIL/i,
      /Client CRM/i,
    ]);

    expect(offenders).toEqual([]);
  });

  test('redirects the retired nutrition workspace into the live meals tab', () => {
    const source = readFileSync(join(appRoot, 'src/app/admin/nutrition/page.tsx'), 'utf8');

    expect(source).toContain("redirect('/admin/pulse?tab=meals')");
    expect(source).not.toContain('MealPrepPlanner');
  });

  test('keeps admin controls wired instead of placeholder-only', () => {
    const offenders = scanFiles(
      [
        join(appRoot, 'src/app/admin'),
        join(appRoot, 'src/components/admin'),
        join(appRoot, 'src/components/meals'),
        join(appRoot, 'src/components/scheduling'),
        join(appRoot, 'src/components/settings'),
      ],
      [
        /href=(["'])#\1/,
        /onClick=\{\(\)\s*=>\s*\{\s*\}\}/,
        /\bcoming soon\b/i,
        /\bnot implemented\b/i,
        /\bunwired\b/i,
      ]
    );

    expect(offenders).toEqual([]);
  });

  test('keeps nutrition target CTAs linked to the selected client profile', () => {
    const source = readFileSync(join(appRoot, 'src/components/admin/TrainerOpsStudio.tsx'), 'utf8');

    expect(source).toContain("const clientProfileHref = `/admin/pulse?tab=clients&client=${encodeURIComponent(selectedClient)}`;");
    expect(source).toContain('href={clientProfileHref}');
    expect(source).toContain('event.preventDefault();');
    expect(source).toContain('onOpenClientProfile();');
    expect(source).toContain('aria-label={`Open ${selectedClient} profile to update ${label.toLowerCase()}`}');
  });

  test('keeps the sidebar collapse control inside the desktop sidebar with click and hover expansion', () => {
    const source = readFileSync(join(appRoot, 'src/components/admin/AdminShell.tsx'), 'utf8');

    expect(source).toContain('<SidebarToggleButton collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(true)} />');
    expect(source).toContain('function handleCollapsedSidebarClick');
    expect(source).toContain('window.setTimeout(expandSidebar, 3000)');
    expect(source).toContain('onMouseEnter={scheduleSidebarExpand}');
    expect(source).toContain('data-testid="admin-sidebar-toggle"');
  });
});

function scanFiles(paths: string[], patterns: RegExp[]) {
  const offenders: string[] = [];

  for (const filePath of collectTextFiles(paths)) {
    const source = readFileSync(filePath, 'utf8');
    for (const pattern of patterns) {
      if (pattern.test(source)) {
        offenders.push(`${relative(repoRoot, filePath)} :: ${pattern.source}`);
      }
    }
  }

  return offenders.sort();
}

function collectTextFiles(paths: string[]) {
  const files: string[] = [];
  const allowedExtensions = new Set(['.css', '.md', '.mdx', '.ts', '.tsx']);

  for (const targetPath of paths) {
    if (!existsSync(targetPath)) continue;
    const stat = statSync(targetPath);
    if (stat.isFile()) {
      if (allowedExtensions.has(extensionFor(targetPath))) files.push(targetPath);
      continue;
    }

    for (const entry of readdirSync(targetPath)) {
      if (entry === '.next' || entry === 'node_modules') continue;
      files.push(...collectTextFiles([join(targetPath, entry)]));
    }
  }

  return files;
}

function extensionFor(filePath: string) {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot === -1 ? '' : filePath.slice(lastDot);
}
